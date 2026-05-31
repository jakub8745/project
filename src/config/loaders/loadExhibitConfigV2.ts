import type {
  AudioModuleInstance,
  ExhibitAsset,
  ExhibitConfigV2,
  MediaDescriptor,
  SceneNodeDefinition,
  SculptureControlInstance,
  VideoModuleInstance
} from '../../types/exhibitSchemaV2';
import { isIpfsUri, resolveOracleUrl } from '../../utils/ipfs';
import type { ExhibitConfig, UnknownRecord } from '../runtimeTypes';
import { normalizeConfig } from './shared';

type SubtitleTrack = {
  language: string;
  label?: string;
  cues: Array<{ start: number; end: number; text: string }>;
};

function getFallbackUri(asset: ExhibitAsset | undefined): string | undefined {
  if (!asset) return undefined;
  return asset.fallbackUris?.find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim();
}

function resolveAssetRuntimeUri(assetId: string | undefined, manifest: ExhibitConfigV2): string | undefined {
  if (!assetId) return undefined;
  const asset = manifest.assets[assetId];
  if (!asset) return undefined;
  if (isIpfsUri(asset.uri)) {
    return getFallbackUri(asset) || resolveOracleUrl(asset.uri, manifest.id);
  }
  return asset.uri || getFallbackUri(asset);
}

function categoryForNode(node: SceneNodeDefinition): string | undefined {
  switch (node.kind) {
    case 'spawn_anchor':
      return 'enter';
    case 'floor':
      return 'floor';
    case 'wall':
    case 'room':
      return 'walls';
    case 'video_surface':
      return 'video';
    case 'video_control':
      return 'videoControl';
    case 'audio_anchor':
      return 'audio';
    case 'image_anchor':
    case 'document_anchor':
      return 'image';
    case 'link_anchor':
      return 'link';
    case 'sculpture':
      return 'sculpture';
    case 'light_anchor':
      return 'light';
    default:
      return undefined;
  }
}

function buildObjectRegistry(manifest: ExhibitConfigV2): Record<string, UnknownRecord> {
  const nodes = manifest.nodes || {};
  const sculptureControls = new Map<string, SculptureControlInstance>();
  for (const instance of manifest.modules?.sculptureControls?.instances || []) {
    sculptureControls.set(instance.targetNode, instance);
  }

  return Object.fromEntries(
    Object.entries(nodes).map(([nodeId, node]) => {
      const category = categoryForNode(node);
      const sculpt = sculptureControls.get(nodeId);
      return [
        nodeId,
        {
          ...(category ? { category } : {}),
          ...(node.ref ? { ref: node.ref } : {}),
          ...(node.spawnDirection ? { spawnDirection: node.spawnDirection } : {}),
          ...(typeof node.holdRotate === 'boolean' ? { holdRotate: node.holdRotate } : {}),
          ...(sculpt
            ? {
                holdRotate: sculpt.holdRotate ?? node.holdRotate,
                transformControls: {
                  mode: sculpt.mode,
                  size: sculpt.size,
                  hover: sculpt.hover,
                  light: sculpt.light
                }
              }
            : {}),
          ...(node.metadata || {})
        } satisfies UnknownRecord
      ];
    })
  );
}

function mediaById(manifest: ExhibitConfigV2, mediaId: string | undefined): MediaDescriptor | undefined {
  if (!mediaId) return undefined;
  return manifest.media?.[mediaId];
}

function mediaTitle(meta?: MediaDescriptor): string | undefined {
  return meta?.title;
}

function mediaDescription(meta?: MediaDescriptor): string | undefined {
  return meta?.description;
}

function mediaAuthor(meta?: MediaDescriptor): string | undefined {
  return meta?.author;
}

function toImageRecord(media: MediaDescriptor, manifest: ExhibitConfigV2): UnknownRecord | null {
  if (media.kind === 'image') {
    return {
      title: media.title,
      description: media.description,
      imagePath: resolveAssetRuntimeUri(media.image.asset, manifest)
    } satisfies UnknownRecord;
  }
  if (media.kind === 'document') {
    return {
      title: media.title,
      description: media.description,
      imagePath: media.previewImage ? resolveAssetRuntimeUri(media.previewImage.asset, manifest) : undefined,
      pdfPath: 'asset' in media.document ? resolveAssetRuntimeUri(media.document.asset, manifest) : media.document.uri,
      pdfOpenPath: media.openUri
    } satisfies UnknownRecord;
  }
  return null;
}

function mapImages(manifest: ExhibitConfigV2): Record<string, UnknownRecord> | undefined {
  const result: Record<string, UnknownRecord> = {};
  const mediaEntries = manifest.media ? Object.entries(manifest.media) : [];
  for (const [id, media] of mediaEntries) {
    if (media.kind !== 'image' && media.kind !== 'document') continue;
    const record = toImageRecord(media, manifest);
    if (record) {
      result[id] = record;
    }
  }

  for (const [nodeId, node] of Object.entries(manifest.nodes || {})) {
    if (node.kind !== 'image_anchor' && node.kind !== 'document_anchor') continue;
    const mediaId = typeof node.media === 'string' && node.media.trim() ? node.media.trim() : nodeId;
    const media = mediaById(manifest, mediaId);
    if (!media) continue;
    if (node.kind === 'image_anchor' && media.kind !== 'image') continue;
    if (node.kind === 'document_anchor' && media.kind !== 'document') continue;
    const record = toImageRecord(media, manifest);
    if (record) {
      result[nodeId] = record;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mapVideoInstance(instance: VideoModuleInstance, manifest: ExhibitConfigV2): UnknownRecord | null {
  const media = mediaById(manifest, instance.media);
  if (!media || media.kind !== 'video') return null;
  return {
    id: instance.targetNode,
    playbackMode: instance.playbackMode,
    autoplayOnEnter: instance.autoplayOnEnter,
    syncStartGroup: instance.syncGroup,
    controls: instance.controls,
    interactive: instance.interactive,
    allowFullscreen: instance.allowFullscreen,
    disableAudio: instance.disableAudio,
    loop: instance.loop,
    muted: instance.muted,
    showLoader: instance.showLoader,
    title: mediaTitle(media),
    description: mediaDescription(media),
    author: mediaAuthor(media),
    poster: media.poster ? resolveAssetRuntimeUri(media.poster.asset, manifest) : undefined,
    sources: media.sources.map((source) => {
      const asset = manifest.assets[source.asset];
      return {
        src: resolveAssetRuntimeUri(source.asset, manifest),
        type: asset?.mimeType
      } satisfies UnknownRecord;
    }),
    videoSurface: instance.surface
  } satisfies UnknownRecord;
}

function parseSubtitleTracks(raw: unknown): SubtitleTrack[] | undefined {
  if (Array.isArray(raw)) {
    return raw as SubtitleTrack[];
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { tracks?: unknown }).tracks)) {
    return (raw as { tracks: SubtitleTrack[] }).tracks;
  }
  return undefined;
}

async function loadSubtitleTracks(assetId: string | undefined, manifest: ExhibitConfigV2): Promise<SubtitleTrack[] | undefined> {
  const asset = assetId ? manifest.assets[assetId] : undefined;
  const url = resolveAssetRuntimeUri(assetId, manifest);
  if (!asset || !url) return undefined;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load subtitle asset ${assetId}: ${response.status}`);
  }
  const text = await response.text();
  if (!text.trim()) return undefined;
  if (asset.mimeType?.includes('json') || url.toLowerCase().endsWith('.json')) {
    return parseSubtitleTracks(JSON.parse(text));
  }
  return undefined;
}

async function mapAudioInstance(instance: AudioModuleInstance, manifest: ExhibitConfigV2): Promise<UnknownRecord | null> {
  const media = mediaById(manifest, instance.media);
  if (!media || media.kind !== 'audio') return null;
  const subtitleTracks = await loadSubtitleTracks(media.subtitles?.[0], manifest);
  return {
    id: instance.targetNode,
    name: instance.targetNode,
    url: resolveAssetRuntimeUri(media.sources[0]?.asset, manifest),
    autoplayOnEnter: instance.autoplayOnEnter,
    autoplayDelayMs: instance.autoplayDelayMs,
    labelPlaying: instance.labelPlaying,
    labelPaused: instance.labelPaused,
    loop: instance.loop,
    refDistance: instance.refDistance,
    rolloff: instance.rolloff,
    maxDistance: instance.maxDistance,
    distanceModel: instance.distanceModel,
    directionalCone: instance.directionalCone,
    coneTarget: instance.coneTarget,
    startOffset: instance.startOffset,
    reverse: instance.reverse,
    volume: instance.volume,
    subtitleTracks,
    title: mediaTitle(media),
    description: mediaDescription(media),
    author: mediaAuthor(media)
  } satisfies UnknownRecord;
}

function mapSculptures(manifest: ExhibitConfigV2): Record<string, UnknownRecord> | undefined {
  const nodes = manifest.nodes || {};
  const sculptures = Object.entries(nodes)
    .filter(([, node]) => node.kind === 'sculpture')
    .map(([nodeId, node]) => {
      const metadata = node.metadata && typeof node.metadata === 'object' ? node.metadata : {};
      return [nodeId, metadata as UnknownRecord] as const;
    });
  return sculptures.length > 0 ? Object.fromEntries(sculptures) : undefined;
}

function mapMetadata(manifest: ExhibitConfigV2): UnknownRecord {
  const ogAssetId = manifest.metadata.ogImage?.asset;
  const ogAsset = ogAssetId ? manifest.assets[ogAssetId] : undefined;
  return {
    title: manifest.metadata.title,
    description: manifest.metadata.description,
    ogImage: ogAsset ? resolveAssetRuntimeUri(ogAssetId, manifest) : undefined,
    ogImageWidth: ogAsset?.width,
    ogImageHeight: ogAsset?.height
  };
}

function mapSidebar(manifest: ExhibitConfigV2): UnknownRecord | undefined {
  if (!manifest.sidebar) return undefined;
  return {
    logo: manifest.sidebar.logoText ? { text: manifest.sidebar.logoText } : undefined,
    items: manifest.sidebar.items?.map((item) => ({
      id: item.id,
      label: item.label,
      content: item.content,
      target: item.contentMedia,
      icon: item.iconAsset ? resolveAssetRuntimeUri(item.iconAsset, manifest) : undefined
    }))
  };
}

function mapSceneTransforms(manifest: ExhibitConfigV2): Pick<ExhibitConfig, 'position' | 'rotation' | 'scale'> {
  const model = manifest.scene.model;
  const scale = typeof model.scale === 'number' ? model.scale : undefined;
  return {
    position: model.position,
    rotation: model.rotation,
    scale
  };
}

function mapViewerExtensions(manifest: ExhibitConfigV2): UnknownRecord {
  const viewer = manifest.viewer && typeof manifest.viewer === 'object' ? manifest.viewer : {};
  return {
    ...(viewer as UnknownRecord)
  };
}

export async function loadExhibitConfigV2(raw: unknown): Promise<ExhibitConfig> {
  const manifest = raw as ExhibitConfigV2;
  const videoInstances = manifest.modules?.video?.instances || [];
  const audioInstances = manifest.modules?.audio?.instances || [];

  const videos = videoInstances
    .map((instance) => mapVideoInstance(instance, manifest))
    .filter((entry): entry is UnknownRecord => entry !== null);
  const audio = (
    await Promise.all(audioInstances.map((instance) => mapAudioInstance(instance, manifest)))
  ).filter((entry): entry is UnknownRecord => entry !== null);

  const runtime: ExhibitConfig = {
    id: manifest.id,
    metadata: mapMetadata(manifest),
    modelPath: resolveAssetRuntimeUri(manifest.scene.model.asset, manifest),
    backgroundTexture: manifest.scene.background?.backgroundAsset
      ? resolveAssetRuntimeUri(manifest.scene.background.backgroundAsset, manifest)
      : undefined,
    environmentTexture: manifest.scene.background?.environmentAsset
      ? resolveAssetRuntimeUri(manifest.scene.background.environmentAsset, manifest)
      : undefined,
    backgroundColor: manifest.scene.background?.color,
    sidebar: mapSidebar(manifest),
    objects: buildObjectRegistry(manifest),
    images: mapImages(manifest),
    videos,
    audio,
    sculptures: mapSculptures(manifest),
    ...mapSceneTransforms(manifest),
    ...mapViewerExtensions(manifest)
  };

  if (manifest.scene.renderer) {
    runtime.params = {
      ...(runtime.params && typeof runtime.params === 'object' ? runtime.params : {}),
      ...manifest.scene.renderer
    };
  }

  return normalizeConfig(runtime);
}
