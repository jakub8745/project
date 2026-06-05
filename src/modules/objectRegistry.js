const CATEGORY_TO_LEGACY_TYPE = {
  audio: 'Audio',
  enter: 'Enter',
  floor: 'Floor',
  image: 'Image',
  link: 'Link',
  pitcher: 'Pitcher',
  room: 'Room',
  sculpture: 'Sculpture',
  video: 'Video',
  videoControl: 'VideoControl',
  visitorLocation: 'visitorLocation',
  wall: 'Wall',
  walls: 'Walls'
};

const LEGACY_TYPE_TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORY_TO_LEGACY_TYPE).map(([category, type]) => [type.toLowerCase(), category])
);

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeCategory(value) {
  const raw = asString(value);
  if (!raw) return undefined;
  const compact = raw.replace(/[\s_-]+/g, '').toLowerCase();
  if (compact === 'videocontrol') return 'videoControl';
  if (compact === 'visitorlocation') return 'visitorLocation';
  const direct = Object.keys(CATEGORY_TO_LEGACY_TYPE).find((key) => key.toLowerCase() === compact);
  if (direct) return direct;
  return LEGACY_TYPE_TO_CATEGORY[raw.toLowerCase()] || raw;
}

function legacyTypeForCategory(category) {
  if (!category) return undefined;
  return CATEGORY_TO_LEGACY_TYPE[category] || CATEGORY_TO_LEGACY_TYPE[normalizeCategory(category)] || category;
}

function copyOptionalUserDataFields(source, target, fields) {
  fields.forEach((field) => {
    if (source?.[field] !== undefined) {
      target[field] = source[field];
    }
  });
}

function normalizeEntry(value, key) {
  const record = asRecord(value);
  if (!record) {
    const category = normalizeCategory(value);
    return category ? { category, objectName: key } : null;
  }
  return {
    ...record,
    objectName: asString(record.objectName) || asString(record.object) || asString(record.node) || key,
    category: normalizeCategory(record.category ?? record.type ?? record.role ?? record.kind)
  };
}

function entryAliases(entry) {
  return [
    asString(entry?.ref),
    asString(entry?.target),
    asString(entry?.node),
    asString(entry?.object),
    asString(entry?.elementID),
    asString(entry?.id)
  ].filter(Boolean);
}

function registerEntry(entries, key, entry) {
  if (!entry) return;
  if (!entries.has(key)) {
    entries.set(key, entry);
  }
  entryAliases(entry).forEach((alias) => {
    if (alias !== key && !entries.has(alias)) {
      entries.set(alias, entry);
    }
  });
}

function entryCategory(entry) {
  return normalizeCategory(entry?.category ?? entry?.type ?? entry?.role ?? entry?.kind);
}

function hasConflictingExplicitType(entry, userData) {
  const legacyCategory = normalizeCategory(userData?.type);
  const configuredCategory = entryCategory(entry);
  return Boolean(legacyCategory && configuredCategory && legacyCategory !== configuredCategory);
}

export function normalizeObjectRegistry(rawRegistry) {
  if (!rawRegistry) return undefined;
  const root = asRecord(rawRegistry);
  const source = root && asRecord(root.objects) ? root.objects : rawRegistry;
  const entries = new Map();

  if (Array.isArray(source)) {
    source.forEach((value) => {
      const record = asRecord(value);
      const key =
        asString(record?.objectName) ||
        asString(record?.object) ||
        asString(record?.node) ||
        asString(record?.name) ||
        asString(record?.id);
      if (!key) return;
      const entry = normalizeEntry(value, key);
      registerEntry(entries, key, entry);
    });
  } else if (asRecord(source)) {
    Object.entries(source).forEach(([key, value]) => {
      const entry = normalizeEntry(value, key);
      registerEntry(entries, key, entry);
    });
  }

  return entries.size > 0 ? entries : undefined;
}

function getEntryMatch(registry, object) {
  if (!registry) return null;

  let current = object;
  while (current) {
    const userData = asRecord(current.userData) || {};
    const candidates = [
      asString(current.name),
      asString(userData.__objectRegistryKey),
      asString(userData.objectName),
      asString(userData.__objectName),
      asString(userData.name),
      asString(userData.__objectRef),
      asString(userData.elementID),
      asString(userData.id)
    ].filter(Boolean);

    for (const candidate of candidates) {
      const entry = registry.get(candidate);
      if (!entry) continue;
      if (hasConflictingExplicitType(entry, userData)) continue;
      return { entry, object: current, userData };
    }
    current = current.parent;
  }
  return null;
}

function getLegacyMatch(object) {
  let current = object;
  while (current) {
    const userData = asRecord(current.userData) || {};
    if (asString(userData.type)) {
      return { object: current, userData };
    }
    current = current.parent;
  }
  return { object, userData: asRecord(object?.userData) || {} };
}

function resolveRef(entry, object, userData) {
  return (
    asString(entry?.ref) ||
    asString(entry?.target) ||
    asString(entry?.mediaId) ||
    asString(entry?.configId) ||
    asString(entry?.elementID) ||
    asString(entry?.id) ||
    asString(userData?.elementID) ||
    asString(userData?.name) ||
    asString(object?.name)
  );
}

export function resolveObjectRuntimeData(object, registry) {
  const match = getEntryMatch(registry, object);
  const legacyMatch = match || getLegacyMatch(object);
  const entry = match?.entry;
  const userData = legacyMatch.userData;
  const matchedObject = legacyMatch.object || object;
  const legacyCategory = normalizeCategory(userData.type);
  const category = normalizeCategory(entry?.category ?? entry?.type ?? entry?.role ?? entry?.kind) || legacyCategory;
  const type = legacyTypeForCategory(category) || asString(userData.type);
  const ref = resolveRef(entry, matchedObject, userData);

  if (!entry && !type && !ref) return null;

  return {
    category,
    type,
    ref,
    name: ref,
    entry: entry || undefined,
    source: entry ? 'config' : 'legacy'
  };
}

export function applyObjectRuntimeData(object, registry) {
  const resolved = resolveObjectRuntimeData(object, registry);
  if (!resolved || resolved.source !== 'config') return resolved;

  const userData = asRecord(object.userData) ? { ...object.userData } : {};
  if (resolved.type) userData.type = resolved.type;
  if (resolved.ref) {
    userData.name = resolved.ref;
    if (resolved.type === 'Video' || resolved.type === 'VideoControl') {
      userData.elementID = resolved.ref;
    }
  }
  if (resolved.category) userData.__objectCategory = resolved.category;
  if (resolved.ref) userData.__objectRef = resolved.ref;
  if (resolved.entry?.objectName) userData.__objectRegistryKey = resolved.entry.objectName;
  if (object.name) userData.__objectName = object.name;
  copyOptionalUserDataFields(resolved.entry, userData, [
    'forwardAxis',
    'lookAxis',
    'directionAxis',
    'direction',
    'spawnDirection',
    'lookDirection',
    'worldDirection'
  ]);
  object.userData = userData;

  return resolved;
}
