import type {
  AudioModuleInstance,
  ExhibitMetadata,
  SceneManifest,
  SidebarDefinition,
  RuntimeModulesConfig,
  ThumbnailCaptureDefinition,
  ViewerCompatConfig,
  MediaDescriptor,
  SceneNodeDefinition,
  SculptureControlInstance,
  VideoModuleInstance
} from '../../types/exhibitSceneTypes';
import { compileRuntimeAsset, runtimeAssetCandidates, type RuntimeAssetSource } from '../assetResolution';
import type { ExhibitConfig, UnknownRecord } from '../runtimeTypes';
import { normalizeConfig } from './shared';

export interface SceneRuntimeSources {
  id: string;
  metadata: ExhibitMetadata;
  assets: Record<string, RuntimeAssetSource & { mimeType?: string; width?: number; height?: number }>;
  sourceScene: SceneManifest;
  nodes?: Record<string, SceneNodeDefinition>;
  media?: Record<string, MediaDescriptor>;
  modules?: RuntimeModulesConfig;
  viewer?: ViewerCompatConfig | Record<string, unknown>;
  sidebar?: SidebarDefinition;
  thumbnailCapture?: ThumbnailCaptureDefinition;
}

type SubtitleTrack = {
  language: string;
  label?: string;
  cues: Array<{ start: number; end: number; text: string }>;
};

const OPTIONAL_ASSET_SOURCE_TIMEOUT_MS = 20_000;

function resolveAssetRuntimeUri(assetId: string | undefined, manifest: SceneRuntimeSources): string | undefined {
  return compileRuntimeAsset(assetId ? manifest.assets[assetId] : undefined).candidates[0];
}

function assetForDeclaredUri(uri: string, manifest: SceneRuntimeSources) {
  const declaredAsset = Object.values(manifest.assets).find((asset) => {
    const record = asset as unknown as UnknownRecord;
    return record.sourceUri === uri || record.ipfsUri === uri;
  });
  return compileRuntimeAsset(declaredAsset || { sourceUri: uri });
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

function buildObjectRegistry(manifest: SceneRuntimeSources): Record<string, UnknownRecord> {
  const nodes = manifest.nodes || {};
  const spawnNodeId = manifest.sourceScene.spawn?.node;
  const sculptureControls = new Map<string, SculptureControlInstance>();
  for (const instance of manifest.modules?.sculptureControls?.instances || []) {
    sculptureControls.set(instance.targetNode, instance);
  }

  return Object.fromEntries(
    Object.entries(nodes).map(([nodeId, node]) => {
      const category = nodeId === spawnNodeId ? 'enter' : categoryForNode(node);
      const sculpt = sculptureControls.get(nodeId);
      const spawnDirection = node.spawnDirection ?? (nodeId === spawnNodeId ? manifest.sourceScene.spawn?.direction : undefined);
      return [
        nodeId,
        {
          ...(category ? { category } : {}),
          ...(node.ref ? { ref: node.ref } : {}),
          ...(typeof node.visible === 'boolean' ? { visible: node.visible } : {}),
          ...(typeof node.interactive === 'boolean' ? { interactive: node.interactive } : {}),
          ...(spawnDirection ? { spawnDirection } : {}),
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
          ...nodeMediaMetadata(node, manifest),
          ...(node.metadata || {})
        } satisfies UnknownRecord
      ];
    })
  );
}

function mediaById(manifest: SceneRuntimeSources, mediaId: string | undefined): MediaDescriptor | undefined {
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

function mediaMetadata(media?: MediaDescriptor): UnknownRecord {
  if (!media) return {};
  return {
    ...(media.title ? { title: media.title } : {}),
    ...(media.tooltipLabel ? { tooltipLabel: media.tooltipLabel } : {}),
    ...(media.description ? { description: media.description } : {}),
    ...(media.author ? { author: media.author } : {})
  };
}

function nodeMediaMetadata(node: SceneNodeDefinition, manifest: SceneRuntimeSources): UnknownRecord {
  const mediaId = typeof node.media === 'string' && node.media.trim() ? node.media.trim() : undefined;
  return mediaMetadata(mediaById(manifest, mediaId));
}

function sidebarContentFromMedia(media?: MediaDescriptor): string | undefined {
  if (!media) return undefined;
  if (media.kind === 'text') return media.text;
  return media.description;
}

function toImageRecord(media: MediaDescriptor, manifest: SceneRuntimeSources): UnknownRecord | null {
  if (media.kind === 'image') {
    const imageAsset = compileRuntimeAsset(manifest.assets[media.image.asset]);
    return {
      title: media.title,
      tooltipLabel: media.tooltipLabel,
      description: media.description,
      imageAsset,
      imagePath: imageAsset.candidates[0]
    } satisfies UnknownRecord;
  }
  if (media.kind === 'document') {
    const pdfAsset = 'asset' in media.document
      ? compileRuntimeAsset(manifest.assets[media.document.asset])
      : compileRuntimeAsset({ sourceUri: media.document.uri });
    const imageAsset = media.previewImage ? compileRuntimeAsset(manifest.assets[media.previewImage.asset]) : undefined;
    return {
      title: media.title,
      tooltipLabel: media.tooltipLabel,
      description: media.description,
      imageAsset,
      imagePath: imageAsset?.candidates[0],
      pdfAsset,
      pdfPath: pdfAsset.candidates[0],
      pdfOpenPath: media.openUri,
      pdfOpenLabel: media.openLabel
    } satisfies UnknownRecord;
  }
  return null;
}

function mapImages(manifest: SceneRuntimeSources): Record<string, UnknownRecord> | undefined {
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

function mapVideoInstance(instance: VideoModuleInstance, manifest: SceneRuntimeSources): UnknownRecord | null {
  const media = mediaById(manifest, instance.media);
  if (!media || media.kind !== 'video') return null;
  const extra = instance as unknown as UnknownRecord;
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
    volume: typeof extra.volume === 'number' ? extra.volume : undefined,
    preload: typeof extra.preload === 'string' ? extra.preload : undefined,
    spatialAudio: typeof extra.spatialAudio === 'boolean' ? extra.spatialAudio : undefined,
    deferLoadUntilPlay: typeof extra.deferLoadUntilPlay === 'boolean' ? extra.deferLoadUntilPlay : undefined,
    controlsAnchorName: typeof extra.controlsAnchorName === 'string' ? extra.controlsAnchorName : undefined,
    showLoader: instance.showLoader,
    title: mediaTitle(media),
    description: mediaDescription(media),
    author: mediaAuthor(media),
    posterAsset: media.poster ? compileRuntimeAsset(manifest.assets[media.poster.asset]) : undefined,
    sources: media.sources.map((source) => {
      const asset = manifest.assets[source.asset];
      const runtimeAsset = compileRuntimeAsset(asset);
      return {
        asset: runtimeAsset,
        src: runtimeAsset.candidates[0],
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

async function loadSubtitleTracks(
  assetId: string | undefined,
  manifest: SceneRuntimeSources,
  signal?: AbortSignal
): Promise<SubtitleTrack[] | undefined> {
  const asset = assetId ? manifest.assets[assetId] : undefined;
  const candidates = runtimeAssetCandidates(compileRuntimeAsset(asset));
  if (!asset || candidates.length === 0) return undefined;

  let lastError: unknown;
  for (const [index, url] of candidates.entries()) {
    if (signal?.aborted) return undefined;
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer = setTimeout(() => controller.abort(), OPTIONAL_ASSET_SOURCE_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Subtitle source returned HTTP ${response.status}: ${url}`);
      }
      const text = await response.text();
      if (!text.trim()) return undefined;
      if (asset.mimeType?.includes('json') || url.toLowerCase().endsWith('.json')) {
        return parseSubtitleTracks(JSON.parse(text));
      }
      return undefined;
    } catch (error) {
      if (signal?.aborted) return undefined;
      lastError = controller.signal.aborted
        ? new Error(`Subtitle source timed out after ${OPTIONAL_ASSET_SOURCE_TIMEOUT_MS / 1000}s: ${url}`)
        : error;
      if (index < candidates.length - 1 && typeof window !== 'undefined') {
        console.warn('[AssetLoader] Subtitle source failed; trying the next configured source.', {
          assetId,
          url,
          error: lastError
        });
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  if (typeof window !== 'undefined') {
    console.warn('[AssetLoader] Optional subtitle asset could not be loaded from any configured source.', {
      assetId,
      error: lastError
    });
  }
  return undefined;
}

function mapAudioInstance(instance: AudioModuleInstance, manifest: SceneRuntimeSources): UnknownRecord | null {
  const media = mediaById(manifest, instance.media);
  if (!media || media.kind !== 'audio') return null;
  const sourceAsset = manifest.assets[media.sources[0]?.asset];
  const asset = compileRuntimeAsset(sourceAsset);
  return {
    id: instance.targetNode,
    name: instance.targetNode,
    asset,
    url: asset.candidates[0],
    autoplayOnEnter: instance.autoplayOnEnter,
    autoplayOnXrSessionStart: instance.autoplayOnXrSessionStart,
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
    subtitleTracks: undefined,
    title: mediaTitle(media),
    description: mediaDescription(media),
    author: mediaAuthor(media)
  } satisfies UnknownRecord;
}

function mapSculptures(manifest: SceneRuntimeSources): Record<string, UnknownRecord> | undefined {
  const nodes = manifest.nodes || {};
  const sculptures = Object.entries(nodes)
    .filter(([, node]) => node.kind === 'sculpture')
    .map(([nodeId, node]) => {
      const metadata = node.metadata && typeof node.metadata === 'object' ? node.metadata : {};
      return [nodeId, metadata as UnknownRecord] as const;
    });
  return sculptures.length > 0 ? Object.fromEntries(sculptures) : undefined;
}

function mapMetadata(manifest: SceneRuntimeSources): UnknownRecord {
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

function mapSidebar(manifest: SceneRuntimeSources): UnknownRecord | undefined {
  if (!manifest.sidebar) return undefined;
  return {
    logo: manifest.sidebar.logoText ? { text: manifest.sidebar.logoText } : undefined,
    items: manifest.sidebar.items?.map((item) => {
      const contentMedia = mediaById(manifest, item.contentMedia);
      return {
        id: item.id,
        label: item.label,
        content:
          item.content ??
          sidebarContentFromMedia(contentMedia) ??
          (item.id === 'info-icon' ? manifest.metadata.description : undefined),
        target: item.contentMedia,
        icon: item.iconAsset ? resolveAssetRuntimeUri(item.iconAsset, manifest) : undefined
      };
    })
  };
}

function mapSceneTransforms(manifest: SceneRuntimeSources): Pick<ExhibitConfig, 'position' | 'rotation' | 'scale'> {
  const model = manifest.sourceScene.model;
  const scale = typeof model?.scale === 'number' ? model.scale : undefined;
  return {
    position: model?.position,
    rotation: model?.rotation,
    scale
  };
}

function mapViewerExtensions(manifest: SceneRuntimeSources): UnknownRecord {
  const viewer = manifest.viewer && typeof manifest.viewer === 'object' ? manifest.viewer : {};
  const viewerRecord = viewer as unknown as UnknownRecord;
  const rawModels = viewerRecord.models;
  const rawRoom = viewerRecord.proceduralRoom;
  const room = rawRoom && typeof rawRoom === 'object' && !Array.isArray(rawRoom)
    ? rawRoom as UnknownRecord : undefined;
  const wallTexture = typeof room?.wallTexture === 'string' ? room.wallTexture : undefined;
  const wallTextureAsset = wallTexture
    ? assetForDeclaredUri(wallTexture, manifest)
    : undefined;
  const models = Array.isArray(rawModels)
    ? rawModels.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        const model = entry as UnknownRecord;
        if (typeof model.path !== 'string') return model;
        const asset = assetForDeclaredUri(model.path, manifest);
        return { ...model, path: asset.candidates[0] || model.path, asset };
      })
    : rawModels;
  return {
    ...(viewer as UnknownRecord),
    ...(models ? { models } : {}),
    ...(room && wallTextureAsset ? {
      proceduralRoom: { ...room, wallTexture: wallTextureAsset.candidates[0] || wallTexture, wallTextureAsset }
    } : {})
  };
}

function audioEntryKey(entry: UnknownRecord): string | undefined {
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : undefined;
  const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : undefined;
  return id ?? name;
}

function mergeAudioEntries(generatedAudio: UnknownRecord[], viewerAudio: unknown): UnknownRecord[] {
  if (!Array.isArray(viewerAudio)) return generatedAudio;

  const generatedByKey = new Map<string, UnknownRecord>();
  for (const entry of generatedAudio) {
    const key = audioEntryKey(entry);
    if (key) generatedByKey.set(key, entry);
  }

  const merged = viewerAudio
    .filter((entry): entry is UnknownRecord => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
    .map((viewerEntry) => {
      const key = audioEntryKey(viewerEntry);
      const generatedEntry = key ? generatedByKey.get(key) : undefined;
      if (key) generatedByKey.delete(key);
      if (!generatedEntry) return viewerEntry;
      return {
        ...generatedEntry,
        ...viewerEntry,
        subtitleTracks: Array.isArray(viewerEntry.subtitleTracks)
          ? viewerEntry.subtitleTracks
          : generatedEntry.subtitleTracks
      };
    });

  return [...merged, ...generatedByKey.values()];
}

function mapSceneSpawnParams(manifest: SceneRuntimeSources): UnknownRecord {
  const spawn = manifest.sourceScene.spawn;
  if (!spawn) return {};
  return {
    ...(Array.isArray(spawn.position) ? { visitorEnter: spawn.position } : {}),
    ...(spawn.direction ? { spawnDirection: spawn.direction } : {})
  };
}

function mapSceneBackgroundParams(manifest: SceneRuntimeSources): UnknownRecord {
  const background = manifest.sourceScene.background;
  if (!background) return {};
  return {
    ...(typeof background.blurriness === 'number' ? { backgroundBlurriness: background.blurriness } : {}),
    ...(typeof background.intensity === 'number' ? { backgroundIntensity: background.intensity } : {})
  };
}

export async function compileRuntimeScene(
  manifest: SceneRuntimeSources,
  signal?: AbortSignal,
  onOptionalUpdate?: (config: ExhibitConfig) => void
): Promise<ExhibitConfig> {
  const videoInstances = manifest.modules?.video?.instances || [];
  const audioInstances = manifest.modules?.audio?.instances || [];

  const videos = videoInstances
    .map((instance) => mapVideoInstance(instance, manifest))
    .filter((entry): entry is UnknownRecord => entry !== null);
  // Audio, video, subtitles and decorative resources are optional. Building the
  // navigable scene must never wait for them. Subtitle tracks are attached later.
  const audio = audioInstances
    .map((instance) => mapAudioInstance(instance, manifest))
    .filter((entry): entry is UnknownRecord => entry !== null);
  const viewerExtensions = mapViewerExtensions(manifest);

  const runtime: ExhibitConfig = {
    id: manifest.id,
    metadata: mapMetadata(manifest),
    modelAsset: manifest.sourceScene.model?.asset ? compileRuntimeAsset(manifest.assets[manifest.sourceScene.model.asset]) : undefined,
    modelPath: manifest.sourceScene.model?.asset ? resolveAssetRuntimeUri(manifest.sourceScene.model.asset, manifest) : undefined,
    backgroundAsset: manifest.sourceScene.background?.backgroundAsset
      ? compileRuntimeAsset(manifest.assets[manifest.sourceScene.background.backgroundAsset]) : undefined,
    backgroundTexture: manifest.sourceScene.background?.backgroundAsset
      ? resolveAssetRuntimeUri(manifest.sourceScene.background.backgroundAsset, manifest)
      : undefined,
    environmentAsset: manifest.sourceScene.background?.environmentAsset
      ? compileRuntimeAsset(manifest.assets[manifest.sourceScene.background.environmentAsset]) : undefined,
    environmentTexture: manifest.sourceScene.background?.environmentAsset
      ? resolveAssetRuntimeUri(manifest.sourceScene.background.environmentAsset, manifest)
      : undefined,
    backgroundColor: manifest.sourceScene.background?.color,
    sidebar: mapSidebar(manifest),
    objects: buildObjectRegistry(manifest),
    images: mapImages(manifest),
    videos,
    audio,
    sculptures: mapSculptures(manifest),
    thumbnailCapture: manifest.thumbnailCapture as UnknownRecord | undefined,
    ...mapSceneTransforms(manifest),
    ...viewerExtensions
  };
  runtime.audio = mergeAudioEntries(audio, viewerExtensions.audio);

  const optionalSubtitleLoad = Promise.all(
    audioInstances.map(async (instance) => {
      const media = mediaById(manifest, instance.media);
      if (!media || media.kind !== 'audio') return;
      const tracks = await loadSubtitleTracks(media.subtitles?.[0], manifest, signal);
      if (signal?.aborted || !tracks) return;
      const target = (runtime.audio as UnknownRecord[] | undefined)?.find(
        (entry) => audioEntryKey(entry) === instance.targetNode
      );
      if (target) {
        target.subtitleTracks = tracks;
        onOptionalUpdate?.(normalizeConfig({ ...runtime, audio: [...(runtime.audio || [])] }));
      }
    })
  ).catch(() => undefined);
  if (onOptionalUpdate) {
    void optionalSubtitleLoad;
  } else {
    // Direct loader consumers retain the historical fully-resolved result. The
    // interactive app supplies onOptionalUpdate and therefore does not block.
    await optionalSubtitleLoad;
  }

  const spawnParams = mapSceneSpawnParams(manifest);
  const existingParams = runtime.params && typeof runtime.params === 'object' ? runtime.params : {};
  const backgroundParams = mapSceneBackgroundParams(manifest);
  if (Object.keys(spawnParams).length > 0 || Object.keys(backgroundParams).length > 0 || Object.keys(existingParams).length > 0 || manifest.sourceScene.renderer) {
    runtime.params = {
      ...existingParams,
      ...manifest.sourceScene.renderer,
      ...backgroundParams,
      ...spawnParams
    };
  }

  return normalizeConfig(runtime);
}
