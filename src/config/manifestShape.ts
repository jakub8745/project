import type { ExhibitConfigV2 } from '../types/exhibitSchemaV2';

export type ManifestRecord = Record<string, unknown>;

function record(value: unknown, path: string): ManifestRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid exhibit config: ${path} must be an object.`);
  }
  return value as ManifestRecord;
}

/** Pure shape conversion, shared by the scene compiler and sidebar (no media fetches). */
export function normalizeManifestShape(raw: unknown): ExhibitConfigV2 {
  const source = record(raw, 'manifest');
  const version = source.schemaVersion;
  if (typeof version !== 'string' || !/^[23]\./.test(version)) {
    throw new Error('Unsupported exhibit config schema. Expected schemaVersion 2.x or 3.x.');
  }
  if (typeof source.id !== 'string' || !source.id.trim()) {
    throw new Error('Invalid exhibit config: a non-empty id is required.');
  }
  const assets = record(source.assets, 'assets');
  if (version.startsWith('2.')) {
    record(source.scene, 'scene');
    return source as unknown as ExhibitConfigV2;
  }
  const graph = record(source.sceneGraph, 'sceneGraph');
  const scene = record(graph.sourceScene, 'sceneGraph.sourceScene');
  record(graph.nodes, 'sceneGraph.nodes');
  record(source.metadata, 'metadata');
  const content = record(source.content, 'content');
  const profiles = graph.viewerProfiles ? record(graph.viewerProfiles, 'sceneGraph.viewerProfiles') : {};
  const viewer = profiles.r3fCurrent ? record(profiles.r3fCurrent, 'sceneGraph.viewerProfiles.r3fCurrent') : {};
  // Procedural exhibits keep their runtime recipe in sceneGraph.profile. Feed
  // that recipe into the legacy runtime shape, while letting the explicit
  // r3fCurrent profile win when both define the same setting.
  const profile = graph.profile ? record(graph.profile, 'sceneGraph.profile') : {};
  const previews = source.previews ? record(source.previews, 'previews') : {};
  const capture = previews.capture ? record(previews.capture, 'previews.capture') : {};
  const provenance = source.provenance ? record(source.provenance, 'provenance') : {};
  const runtimeAssets = Object.fromEntries(Object.entries(assets).map(([id, value]) => {
    const asset = record(value, `assets.${id}`);
    const fallbacks = Array.isArray(asset.fallbackUris)
      ? asset.fallbackUris.filter((uri): uri is string => typeof uri === 'string' && Boolean(uri.trim()))
      : undefined;
    const ipfsUri = typeof asset.ipfsUri === 'string' && asset.ipfsUri.trim() ? asset.ipfsUri : undefined;
    const sourceUri = typeof asset.sourceUri === 'string' && asset.sourceUri.trim() ? asset.sourceUri : undefined;
    return [id, { ...asset, uri: ipfsUri || sourceUri || fallbacks?.[0], fallbackUris: fallbacks }];
  }));
  return {
    schemaVersion: '2.0.0-adapted-from-v3',
    id: source.id,
    metadata: source.metadata,
    assets: runtimeAssets,
    scene: { ...scene },
    nodes: graph.nodes,
    media: content.media,
    sidebar: content.sidebar,
    modules: graph.modules,
    viewer: { ...profile, ...viewer },
    interactions: source.interactions,
    thumbnailCapture: capture.r3fCurrent,
    metadataExtras: provenance.legacyMetadataExtras,
    nft: source.nft
  } as unknown as ExhibitConfigV2;
}
