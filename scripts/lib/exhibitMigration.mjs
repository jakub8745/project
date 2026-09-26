import { createHash } from 'node:crypto';

export const MIGRATION = 'v2-to-v3-structural-1';
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const knownFields = new Set(['schemaVersion','id','kind','metadata','nft','assets','scene','nodes','media','interactions','modules','sidebar','thumbnailCapture','viewer','metadataExtras']);
const mimeTypes = { glb:'model/gltf-binary',gltf:'model/gltf+json',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',ktx2:'image/ktx2',mp4:'video/mp4',mp3:'audio/mpeg',json:'application/json',md:'text/markdown',pdf:'application/pdf' };

export function convertV2ToV3(source, { sourcePath, sourceHash, id = source.id, slug = id } = {}) {
  if (!source?.schemaVersion?.startsWith('2.') || !source.assets || !source.scene) throw new Error('Expected a v2 exhibit with assets and scene.');
  const warnings = [];
  const unmappedFields = Object.keys(source).filter((key) => !knownFields.has(key));
  const assets = Object.fromEntries(Object.entries(source.assets).map(([assetId, asset]) => {
    const { uri, ...rest } = asset;
    if (typeof uri !== 'string' || !uri) throw new Error(`assets.${assetId}.uri is missing`);
    const ipfsUri = uri.startsWith('ipfs://') ? uri : null;
    const result = {
      ...rest, id: assetId, sourceUri: uri, ipfsUri,
      mimeType: asset.mimeType || mimeTypes[uri.split(/[?#]/)[0].split('.').pop()?.toLowerCase()] || 'application/octet-stream',
      preservation: { status: 'verification_pending', integrityAlgorithm: 'sha256' }
    };
    if (id !== source.id && ipfsUri && !asset.fallbackUris?.length) {
      // Pin the OLD bucket explicitly before repairing an exhibit's identity.
      const filename = uri.split('/').pop();
      result.fallbackUris = [`https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/${source.id}/o/${encodeURIComponent(filename)}`];
    }
    if (!asset.mimeType) warnings.push(`assets.${assetId}: inferred MIME type ${result.mimeType}`);
    return [assetId, result];
  }));
  const interactions = (source.interactions || []).map((entry) => ({
    ...entry,
    type: entry.type || entry.action?.type || 'custom',
    targets: entry.targets || (entry.targetNode ? [entry.targetNode] : []),
    behavior: entry.behavior || entry.action || {},
    ...(entry.ui?.description ? { description: entry.ui.description } : {})
  }));
  const media = structuredClone(source.media || {});
  const sidebar = structuredClone(source.sidebar || { items: [] });
  for (const [index, item] of (sidebar.items || []).entries()) {
    if (!item.id) {
      item.id = `sidebar_${index}`;
      warnings.push(`sidebar.items[${index}]: assigned stable ID ${item.id}`);
    }
    const target = item.contentMedia || item.target;
    if (target && !media[target]) {
      const text = item.content || (item.id === 'info-icon' ? source.metadata?.description : undefined);
      if (typeof text === 'string') {
        media[target] = { kind: 'text', text };
        warnings.push(`media.${target}: materialized existing inline sidebar text`);
      }
    }
  }
  for (const interaction of interactions) {
    const mediaId = interaction.action?.media;
    const node = source.nodes?.[interaction.targetNode];
    if (mediaId && !media[mediaId] && node?.kind === 'sculpture') {
      media[mediaId] = { kind: 'sculpture', title: mediaId, ...(node.metadata || {}) };
      warnings.push(`media.${mediaId}: materialized existing sculpture metadata`);
    }
  }
  const modules = source.modules || {};
  for (const [name, type] of [['video','video_playback'],['audio','spatial_audio'],['sculptureControls','object_manipulation']]) {
    for (const instance of modules[name]?.instances || []) {
      if (interactions.some((entry) => entry.action?.moduleInstance === instance.id)) continue;
      interactions.push({ id: `module_${name}_${instance.id}`, type, targets: [instance.targetNode], ...(instance.media ? { media: instance.media } : {}), behavior: { ...instance } });
    }
  }
  for (const [nodeId, node] of Object.entries(source.nodes || {})) {
    if (!node.media || !['image_anchor','document_anchor'].includes(node.kind)) continue;
    if (interactions.some((entry) => entry.targets.includes(nodeId))) continue;
    interactions.push({ id: `node_${nodeId}_open`, type: node.kind === 'document_anchor' ? 'open_document' : 'open_image', targets: [nodeId], media: node.media, behavior: { trigger: 'click' } });
  }
  const viewer = source.viewer || {};
  const procedural = Boolean(viewer.proceduralRoom);
  const capabilities = ['spatial navigation','named scene nodes','sidebar and media panels'];
  if (source.scene.model) capabilities.push('load glTF/GLB scene asset');
  if (procedural) capabilities.push('procedural geometry','animated actors','collision physics');
  if (modules.video) capabilities.push('video surfaces and configured synchronization');
  if (modules.audio) capabilities.push('spatial audio and optional subtitles');
  if (modules.chat?.enabled) capabilities.push('chat service and external persona prompts');
  if (modules.surfacePrints?.enabled) capabilities.push('persistent surface prints service');
  if (id !== source.id) warnings.push(`Identity repaired: ${source.id} -> ${id}; original storage locations retained explicitly.`);
  if (unmappedFields.length) warnings.push(`Unmapped top-level fields retained in extensions.legacy: ${unmappedFields.join(', ')}`);
  const manifest = {
    $schema: './schemas/exhibit_manifest_v3.schema.json',
    schemaVersion: '3.0.0-draft', manifestType: 'future-proof-exhibit-archive', profile: 'portable-exhibit', id, slug,
    sourceManifest: { schemaVersion: source.schemaVersion, path: sourcePath, sha256: sourceHash, migration: MIGRATION, id: source.id },
    metadata: { ...source.metadata },
    provenance: { sourceKind: source.kind, ...(source.metadataExtras ? { legacyMetadataExtras: source.metadataExtras } : {}), ...(source.nft ? { legacyNft: source.nft } : {}) },
    rights: { status: 'review_required' },
    nft: { mintable: false },
    assets,
    content: { media, sidebar },
    sceneGraph: {
      sourceScene: { ...source.scene }, nodes: source.nodes || {}, modules,
      viewerProfiles: { r3fCurrent: { ...viewer } },
      ...(procedural ? { proceduralRecipe: {
        room: viewer.proceduralRoom, models: viewer.models || [], objects: viewer.proceduralObjects || [], physics: viewer.physics || {},
        services: { chat: modules.chat || {}, surfacePrints: modules.surfacePrints || {} },
        serviceUnavailableBehavior: 'The navigable room remains available; live conversation and persisted prints require the configured API. Preserve existing viewer error handling.'
      } } : {})
    },
    interactions,
    previews: { ...(source.thumbnailCapture ? { capture: { r3fCurrent: source.thumbnailCapture } } : {}) },
    viewerBrief: {
      purpose: source.metadata?.description || `Present ${source.metadata?.title || id}.`,
      requiredCapabilities: capabilities,
      reconstructionPrompt: 'Preserve the source scene, stable node identities, media relationships and configured behavior. The r3fCurrent profile records the working implementation, including overrides. Reconstruct equivalent behavior and document unavailable external services.',
      visualTone: 'Preserve this exhibit’s configured materials, lighting, exposure and presentation.'
    },
    preservation: {
      futureProofDefinition: 'Preserve assets, scene relationships, behavior, provenance and the information needed to reconstruct the exhibit independently of the original viewer.',
      requiredBeforeMinting: ['Verify asset availability and integrity.','Record verified immutable asset URIs and rights.','Publish the manifest and keep its final CID/hash in an external receipt.'],
      status: 'runtime_migration_complete_archival_review_pending'
    },
    ...(unmappedFields.length ? { extensions: { legacy: Object.fromEntries(unmappedFields.map((key) => [key, source[key]])) } } : {})
  };
  return { manifest, warnings, unmappedFields };
}
