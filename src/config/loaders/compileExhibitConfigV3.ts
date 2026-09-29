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
  return compileRuntimeScene({
    id: manifest.id,
    metadata: manifest.metadata,
    assets: manifest.assets,
    sourceScene: graph.sourceScene,
    nodes: graph.nodes,
    media: manifest.content.media,
    modules: graph.modules,
    viewer: {
      ...profile,
      ...viewer,
      ...(audioZones.length ? { audioZones } : {}),
      ...(lightZones.length ? { lightZones } : {})
    },
    sidebar: manifest.content.sidebar,
    thumbnailCapture: manifest.previews?.capture?.r3fCurrent
  }, signal, onOptionalUpdate);
}
