import type { Vector3Tuple } from 'three';
import type {
  ProceduralModelAnimationSpec,
  ProceduralModelSpec,
  ProceduralObjectShape,
  ProceduralObjectSpec,
  ProceduralRoomBounds,
  ProceduralRoomSpec
} from './types';

export function coercePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function coerceVector(value: unknown, fallback: Vector3Tuple = [0, 0, 0]): Vector3Tuple {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [
    typeof value[0] === 'number' && Number.isFinite(value[0]) ? value[0] : fallback[0],
    typeof value[1] === 'number' && Number.isFinite(value[1]) ? value[1] : fallback[1],
    typeof value[2] === 'number' && Number.isFinite(value[2]) ? value[2] : fallback[2]
  ];
}

export function coerceProceduralAnimation(
  source: unknown,
  fallbackBobDistance = 0
): ProceduralModelAnimationSpec | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const animation = source as Record<string, unknown>;
  const direction = animation.direction;
  return {
    swayAngle: typeof animation.swayAngle === 'number' ? animation.swayAngle : 0,
    swaySpeed: typeof animation.swaySpeed === 'number' ? animation.swaySpeed : 0.8,
    driftDistance: typeof animation.driftDistance === 'number' ? animation.driftDistance : 0,
    driftSpeed: typeof animation.driftSpeed === 'number' ? animation.driftSpeed : 0.35,
    bobDistance: typeof animation.bobDistance === 'number' ? animation.bobDistance : fallbackBobDistance,
    bobSpeed: typeof animation.bobSpeed === 'number' ? animation.bobSpeed : 0.5,
    collisionAware: typeof animation.collisionAware === 'boolean' ? animation.collisionAware : false,
    speed: typeof animation.speed === 'number' ? animation.speed : 0.45,
    boundaryPadding: typeof animation.boundaryPadding === 'number' ? animation.boundaryPadding : 0.8,
    turnJitter: typeof animation.turnJitter === 'number' ? animation.turnJitter : 0.35,
    direction: Array.isArray(direction) && direction.length >= 2
      ? [Number(direction[0]) || 1, Number(direction[1]) || 0]
      : [1, 0]
  };
}

export function parseProceduralModels(models: unknown): ProceduralModelSpec[] | undefined {
  if (!Array.isArray(models)) return undefined;
  const mapped = models
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const path = typeof record.path === 'string' ? record.path : undefined;
      if (!path) return null;
      return {
        id: typeof record.id === 'string' ? record.id : undefined,
        path,
        position: coerceVector(record.position),
        rotation: coerceVector(record.rotation),
        scale: typeof record.scale === 'number' && Number.isFinite(record.scale) ? record.scale : 1,
        collisionRadius:
          typeof record.collisionRadius === 'number' && Number.isFinite(record.collisionRadius)
            ? record.collisionRadius
            : 0.85,
        animation: coerceProceduralAnimation(record.animation)
      } as ProceduralModelSpec;
    })
    .filter((entry): entry is ProceduralModelSpec => entry !== null);
  return mapped.length > 0 ? mapped : undefined;
}

export function parseProceduralObjects(objects: unknown): ProceduralObjectSpec[] | undefined {
  if (!Array.isArray(objects)) return undefined;
  const randomTexturePoolByGroup = new Map<string, string[]>();
  const mapped = objects
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const shape = typeof record.shape === 'string' ? record.shape : 'sphere';
      if (!['sphere', 'box', 'torusKnot', 'icosahedron', 'blob'].includes(shape)) return null;
      const sizeRaw = record.size;
      const size = Array.isArray(sizeRaw) && sizeRaw.length >= 3
        ? coerceVector(sizeRaw, [1, 1, 1])
        : [
            typeof sizeRaw === 'number' ? sizeRaw : 1,
            typeof sizeRaw === 'number' ? sizeRaw : 1,
            typeof sizeRaw === 'number' ? sizeRaw : 1
          ] as Vector3Tuple;
      const scaleRaw = record.scale;
      const scale = Array.isArray(scaleRaw) && scaleRaw.length >= 3
        ? coerceVector(scaleRaw, [1, 1, 1])
        : [
            typeof scaleRaw === 'number' ? scaleRaw : 1,
            typeof scaleRaw === 'number' ? scaleRaw : 1,
            typeof scaleRaw === 'number' ? scaleRaw : 1
          ] as Vector3Tuple;
      const material = record.material && typeof record.material === 'object'
        ? record.material as Record<string, unknown>
        : {};
      const userData = record.userData && typeof record.userData === 'object'
        ? (record.userData as Record<string, unknown>)
        : undefined;
      const textureRepeat = Array.isArray(material.textureRepeat) && material.textureRepeat.length >= 2
        ? [
            Number((material.textureRepeat as unknown[])[0]) || 1,
            Number((material.textureRepeat as unknown[])[1]) || 1
          ] as [number, number]
        : [1, 1] as [number, number];
      const textureRandomPool = Array.isArray(material.textureRandomPool)
        ? (material.textureRandomPool as unknown[]).filter((item): item is string => typeof item === 'string')
        : [];
      const textureRandomGroup =
        typeof material.textureRandomGroup === 'string' ? material.textureRandomGroup : 'default';
      let resolvedTexture = typeof material.texture === 'string' ? material.texture : undefined;
      if (textureRandomPool.length > 0) {
        let groupPool = randomTexturePoolByGroup.get(textureRandomGroup);
        if (!groupPool || groupPool.length === 0) {
          groupPool = [...textureRandomPool];
        }
        const pickIndex = Math.floor(Math.random() * groupPool.length);
        resolvedTexture = groupPool[pickIndex];
        groupPool.splice(pickIndex, 1);
        randomTexturePoolByGroup.set(textureRandomGroup, groupPool);
      }
      return {
        id: typeof record.id === 'string' ? record.id : undefined,
        shape: shape as ProceduralObjectShape,
        position: coerceVector(record.position, [0, 1, 0]),
        rotation: coerceVector(record.rotation),
        scale,
        size,
        radius: typeof record.radius === 'number' && Number.isFinite(record.radius) ? Math.max(0.02, record.radius) : 0.65,
        detail: typeof record.detail === 'number' && Number.isFinite(record.detail) ? Math.max(0, Math.floor(record.detail)) : 0,
        tube: typeof record.tube === 'number' && Number.isFinite(record.tube) ? Math.max(0.01, record.tube) : 0.22,
        tubularSegments:
          typeof record.tubularSegments === 'number' && Number.isFinite(record.tubularSegments)
            ? Math.max(16, Math.floor(record.tubularSegments))
            : 128,
        radialSegments:
          typeof record.radialSegments === 'number' && Number.isFinite(record.radialSegments)
            ? Math.max(8, Math.floor(record.radialSegments))
            : 32,
        p: typeof record.p === 'number' && Number.isFinite(record.p) ? Math.max(2, Math.floor(record.p)) : 2,
        q: typeof record.q === 'number' && Number.isFinite(record.q) ? Math.max(2, Math.floor(record.q)) : 3,
        blobAmplitude:
          typeof record.blobAmplitude === 'number' && Number.isFinite(record.blobAmplitude)
            ? Math.max(0, record.blobAmplitude)
            : 0.18,
        blobFrequency:
          typeof record.blobFrequency === 'number' && Number.isFinite(record.blobFrequency)
            ? Math.max(0.1, record.blobFrequency)
            : 2,
        blobSpeed:
          typeof record.blobSpeed === 'number' && Number.isFinite(record.blobSpeed)
            ? Math.max(0.05, record.blobSpeed)
            : 1,
        collisionRadius:
          typeof record.collisionRadius === 'number' && Number.isFinite(record.collisionRadius)
            ? Math.max(0.05, record.collisionRadius)
            : 0.65,
        castShadow: record.castShadow !== false,
        receiveShadow: record.receiveShadow !== false,
        userData: userData
          ? {
              type: typeof userData.type === 'string' ? userData.type : undefined,
              name: typeof userData.name === 'string' ? userData.name : undefined
            }
          : undefined,
        animation: coerceProceduralAnimation(record.animation, 0.03),
        material: {
          color: typeof material.color === 'string' ? material.color : '#ffffff',
          metalness:
            typeof material.metalness === 'number' && Number.isFinite(material.metalness)
              ? Math.min(1, Math.max(0, material.metalness))
              : 1,
          roughness:
            typeof material.roughness === 'number' && Number.isFinite(material.roughness)
              ? Math.min(1, Math.max(0, material.roughness))
              : 0.06,
          emissive: typeof material.emissive === 'string' ? material.emissive : '#000000',
          emissiveIntensity:
            typeof material.emissiveIntensity === 'number' && Number.isFinite(material.emissiveIntensity)
              ? Math.max(0, material.emissiveIntensity)
              : 0,
          envMapIntensity:
            typeof material.envMapIntensity === 'number' && Number.isFinite(material.envMapIntensity)
              ? Math.max(0, material.envMapIntensity)
              : 1,
          texture: resolvedTexture,
          textureRepeat,
          transmission:
            typeof material.transmission === 'number' && Number.isFinite(material.transmission)
              ? Math.min(1, Math.max(0, material.transmission))
              : 0,
          thickness:
            typeof material.thickness === 'number' && Number.isFinite(material.thickness)
              ? Math.max(0, material.thickness)
              : 0,
          ior:
            typeof material.ior === 'number' && Number.isFinite(material.ior)
              ? Math.max(1, material.ior)
              : 1.45,
          clearcoat:
            typeof material.clearcoat === 'number' && Number.isFinite(material.clearcoat)
              ? Math.min(1, Math.max(0, material.clearcoat))
              : 0,
          clearcoatRoughness:
            typeof material.clearcoatRoughness === 'number' && Number.isFinite(material.clearcoatRoughness)
              ? Math.min(1, Math.max(0, material.clearcoatRoughness))
              : 0,
          reflectivity:
            typeof material.reflectivity === 'number' && Number.isFinite(material.reflectivity)
              ? Math.min(1, Math.max(0, material.reflectivity))
              : 0.8,
          opacity:
            typeof material.opacity === 'number' && Number.isFinite(material.opacity)
              ? Math.min(1, Math.max(0, material.opacity))
              : 1,
          realtimeEnvMap: material.realtimeEnvMap === true,
          envMapResolution:
            typeof material.envMapResolution === 'number' && Number.isFinite(material.envMapResolution)
              ? Math.max(64, Math.floor(material.envMapResolution))
              : 256,
          envMapRefreshFrames:
            typeof material.envMapRefreshFrames === 'number' && Number.isFinite(material.envMapRefreshFrames)
              ? Math.max(1, Math.floor(material.envMapRefreshFrames))
              : 1
        }
      } as ProceduralObjectSpec;
    })
    .filter((entry): entry is ProceduralObjectSpec => entry !== null);
  return mapped.length > 0 ? mapped : undefined;
}

export function getProceduralRoomBounds(proceduralRoom: ProceduralRoomSpec): ProceduralRoomBounds | undefined {
  if (!proceduralRoom) return undefined;
  const width = coercePositiveNumber(proceduralRoom.width, 16);
  const depth = coercePositiveNumber(proceduralRoom.depth, 16);
  return {
    minX: -width / 2,
    maxX: width / 2,
    minZ: -depth / 2,
    maxZ: depth / 2
  };
}
