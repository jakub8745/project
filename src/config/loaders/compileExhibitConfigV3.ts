import type { ExhibitConfigV3 } from '../../types/exhibitSchemaV3';
import type { ExhibitConfig, UnknownRecord } from '../runtimeTypes';
import { compileRuntimeScene } from './compileRuntimeScene';

function object(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid exhibit config: ${path} must be an object.`);
  }
  return value as UnknownRecord;
}

/** Runtime structure and references needed to compile a navigable V3 scene. */
export function validateRuntimeV3(raw: unknown): ExhibitConfigV3 {
  const manifest = object(raw, 'manifest');
  if (typeof manifest.schemaVersion !== 'string' || !manifest.schemaVersion.startsWith('3.')) {
    throw new Error('Unsupported exhibit config schema. Expected schemaVersion 3.x.');
  }
  if (typeof manifest.id !== 'string' || !manifest.id.trim()) {
    throw new Error('Invalid exhibit config: a non-empty id is required.');
  }
  const assets = object(manifest.assets, 'assets');
  object(manifest.metadata, 'metadata');
  const graph = object(manifest.sceneGraph, 'sceneGraph');
  const scene = object(graph.sourceScene, 'sceneGraph.sourceScene');
  object(graph.nodes, 'sceneGraph.nodes');
  const content = object(manifest.content, 'content');
  const media = content.media === undefined ? {} : object(content.media, 'content.media');
  if (content.sidebar !== undefined) object(content.sidebar, 'content.sidebar');

  const requireAsset = (id: unknown, path: string) => {
    if (typeof id !== 'string' || !assets[id]) {
      throw new Error(`Invalid exhibit config: ${path} references an unknown asset ${String(id)}.`);
    }
  };
  if (scene.model) requireAsset(object(scene.model, 'sceneGraph.sourceScene.model').asset, 'sceneGraph.sourceScene.model.asset');
  if (scene.background) {
    const background = object(scene.background, 'sceneGraph.sourceScene.background');
    for (const key of ['backgroundAsset', 'environmentAsset']) {
      if (background[key] != null) requireAsset(background[key], `sceneGraph.sourceScene.background.${key}`);
    }
  }
  const proceduralRecipe = graph.proceduralRecipe && typeof graph.proceduralRecipe === 'object'
    ? graph.proceduralRecipe as UnknownRecord : {};
  const infiniteWorld = proceduralRecipe.infiniteWorld && typeof proceduralRecipe.infiniteWorld === 'object'
    ? proceduralRecipe.infiniteWorld as UnknownRecord : undefined;
  if (infiniteWorld && Array.isArray(infiniteWorld.models)) {
    infiniteWorld.models.forEach((entry, index) => {
      const model = object(entry, `sceneGraph.proceduralRecipe.infiniteWorld.models[${index}]`);
      requireAsset(model.asset, `sceneGraph.proceduralRecipe.infiniteWorld.models[${index}].asset`);
    });
  }
  if (infiniteWorld) {
    for (const key of ['visitor', 'floor', 'fog', 'distribution', 'scale', 'orientation', 'recycling', 'background']) {
      object(infiniteWorld[key], `sceneGraph.proceduralRecipe.infiniteWorld.${key}`);
    }
    if (!Array.isArray(infiniteWorld.models) || infiniteWorld.models.length === 0) {
      throw new Error('Invalid exhibit config: sceneGraph.proceduralRecipe.infiniteWorld.models must be a non-empty array.');
    }
    const models = infiniteWorld.models;
    const ids = models.map((entry, index) => object(entry, `sceneGraph.proceduralRecipe.infiniteWorld.models[${index}]`).id);
    if (ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
      throw new Error('Invalid exhibit config: infinite-world model ids must be non-empty and unique.');
    }
    const distribution = infiniteWorld.distribution as UnknownRecord;
    const activePopulation = infiniteWorld.activePopulation as UnknownRecord;
    const recycling = infiniteWorld.recycling as UnknownRecord;
    const orientation = infiniteWorld.orientation as UnknownRecord;
    if (distribution.algorithm !== 'seeded-poisson-disk-annulus') {
      throw new Error('Invalid exhibit config: unsupported infinite-world distribution algorithm.');
    }
    if (activePopulation.count !== models.length) {
      throw new Error('Invalid exhibit config: activePopulation.count must match the infinite-world models array length.');
    }
    if (recycling.strategy !== 'reuse-loaded-instance') {
      throw new Error('Invalid exhibit config: unsupported infinite-world recycling strategy.');
    }
    if (orientation.yaw !== 'uniform-random-[0,2pi)' && orientation.yaw !== 'fixed') {
      throw new Error('Invalid exhibit config: unsupported infinite-world yaw rule.');
    }
  }
  const modules = graph.modules === undefined ? {} : object(graph.modules, 'sceneGraph.modules');
  for (const kind of ['audio', 'video']) {
    const module = modules[kind];
    if (!module) continue;
    const instances = object(module, `sceneGraph.modules.${kind}`).instances;
    if (!Array.isArray(instances)) continue;
    for (const instance of instances) {
      const record = object(instance, `sceneGraph.modules.${kind}.instances[]`);
      if (typeof record.media !== 'string' || !media[record.media]) {
        throw new Error(`Invalid exhibit config: ${kind} instance references unknown media ${String(record.media)}.`);
      }
    }
  }
  return raw as ExhibitConfigV3;
}

function portableRoutes(interactions: unknown[], type: string): UnknownRecord[] {
  return interactions
    .filter((entry): entry is UnknownRecord => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
    .filter((entry) => entry.type === type && entry.behavior && typeof entry.behavior === 'object')
    .map((entry) => ({
      id: entry.id,
      description: entry.description,
      surfaces: Array.isArray(entry.targets) ? entry.targets : [],
      ...(entry.behavior as UnknownRecord)
    }));
}

/** Compile V3 scene, media, and viewer fields directly into the runtime scene. */
export async function compileExhibitConfigV3(
  raw: unknown,
  signal?: AbortSignal,
  onOptionalUpdate?: (scene: ExhibitConfig) => void
): Promise<ExhibitConfig> {
  const manifest = validateRuntimeV3(raw);
  const graph = manifest.sceneGraph;
  const viewer = graph.viewerProfiles?.r3fCurrent || {};
  const profile = graph.profile && typeof graph.profile === 'object' && !Array.isArray(graph.profile)
    ? graph.profile as UnknownRecord : {};
  const interactions = Array.isArray(manifest.interactions) ? manifest.interactions : [];
  const audioZones = portableRoutes(interactions, 'location_audio_route');
  const lightZones = portableRoutes(interactions, 'location_light_profile');
  const world = graph.proceduralRecipe?.infiniteWorld as UnknownRecord | undefined;
  const worldVisitor = world?.visitor as UnknownRecord | undefined;
  const worldBackground = world?.background as UnknownRecord | undefined;
  const sourceScene = worldVisitor ? {
    ...graph.sourceScene,
    spawn: {
      ...(graph.sourceScene.spawn || {}),
      ...(Array.isArray(worldVisitor.spawnPosition) ? { position: worldVisitor.spawnPosition as [number, number, number] } : {}),
      ...(typeof worldVisitor.spawnDirection === 'string' ? { direction: worldVisitor.spawnDirection } : {})
    },
    background: {
      ...(graph.sourceScene.background || {}),
      ...(typeof worldBackground?.color === 'string' ? { color: worldBackground.color } : {})
    }
  } : graph.sourceScene;
  const profileParams = (viewer as UnknownRecord).params;
  const adaptedParams = {
    ...(profileParams && typeof profileParams === 'object' ? profileParams as UnknownRecord : {}),
    ...(worldVisitor && typeof worldVisitor.walkingSpeed === 'number' ? { visitorSpeed: worldVisitor.walkingSpeed } : {}),
    ...(worldVisitor && typeof worldVisitor.eyeHeight === 'number' ? { heightOffset: [0, worldVisitor.eyeHeight, 0] } : {}),
    ...(worldVisitor && typeof worldVisitor.gravity === 'number' ? { gravity: worldVisitor.gravity } : {}),
    ...(worldVisitor && typeof worldVisitor.movementAcceleration === 'number' ? { movementAcceleration: worldVisitor.movementAcceleration } : {}),
    ...(worldVisitor && typeof worldVisitor.movementDeceleration === 'number' ? { movementDeceleration: worldVisitor.movementDeceleration } : {})
  };
  return compileRuntimeScene({
    id: manifest.id,
    metadata: manifest.metadata,
    assets: manifest.assets,
    sourceScene,
    nodes: graph.nodes,
    media: manifest.content.media,
    modules: graph.modules,
    viewer: {
      ...profile,
      ...viewer,
      ...(worldVisitor && graph.sourceScene.camera ? { camera: graph.sourceScene.camera } : {}),
      ...(worldVisitor ? { params: adaptedParams } : {}),
      ...(audioZones.length ? { audioZones } : {}),
      ...(lightZones.length ? { lightZones } : {})
    },
    proceduralRecipe: graph.proceduralRecipe as UnknownRecord | undefined,
    sidebar: manifest.content.sidebar,
    thumbnailCapture: manifest.previews?.capture?.r3fCurrent
  }, signal, onOptionalUpdate);
}
