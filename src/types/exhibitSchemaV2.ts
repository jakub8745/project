export type ManifestId = string;
export type AssetId = string;
export type MediaId = string;
export type NodeId = string;
export type InteractionId = string;
export type ModuleInstanceId = string;

export type Vector2Tuple = [number, number];
export type Vector3Tuple = [number, number, number];
export type EulerTuple = [number, number, number];

export type ExhibitAssetKind =
  | 'model'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'texture'
  | 'subtitle'
  | 'data'
  | 'archive';

export interface AssetIntegrityRecord {
  cid?: string;
  sha256?: string;
}

export interface ExhibitAsset {
  kind: ExhibitAssetKind;
  uri: string;
  fallbackUris?: string[];
  mimeType?: string;
  integrity?: AssetIntegrityRecord;
  width?: number;
  height?: number;
  durationSec?: number;
  byteLength?: number;
  metadata?: Record<string, unknown>;
}

export interface AssetPointer {
  asset: AssetId;
}

export interface MetadataAssetPointer extends AssetPointer {
  alt?: string;
}

export interface ExhibitAuthor {
  name: string;
  role?: string;
  wallet?: string;
  uri?: string;
}

export interface ExhibitMetadata {
  title: string;
  description: string;
  language?: string;
  authors?: ExhibitAuthor[];
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  ogImage?: MetadataAssetPointer;
}

export interface NftManifest {
  mintable: boolean;
  tokenStandard?: 'ERC-721' | 'ERC-1155' | string;
  canonicalConfigUri?: string;
  canonicalPreviewAsset?: AssetId;
  canonicalSceneAsset?: AssetId;
  assetBundleCid?: string;
  integrity?: AssetIntegrityRecord & {
    configSha256?: string;
    bundleCid?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface SceneModelPointer extends AssetPointer {
  position?: Vector3Tuple;
  rotation?: EulerTuple;
  scale?: number | Vector3Tuple;
}

export interface SceneBackgroundConfig {
  color?: string;
  backgroundAsset?: AssetId | null;
  environmentAsset?: AssetId | null;
  blurriness?: number;
  intensity?: number;
}

export interface SceneSpawnConfig {
  node?: NodeId;
  position?: Vector3Tuple;
  direction?: 'north' | 'south' | 'east' | 'west' | 'up' | 'down' | string | Vector3Tuple;
}

export interface SceneCameraConfig {
  mode?: 'first_person' | 'orbit' | 'fixed' | string;
  fov?: number;
  near?: number;
  far?: number;
  position?: Vector3Tuple;
  target?: Vector3Tuple;
}

export interface SceneRendererConfig {
  toneMapping?: 'neutral' | 'aces' | 'cineon' | 'reinhard' | 'linear' | 'none' | string;
  autoExposure?: boolean;
  exposure?: number;
  exposureTarget?: number;
  exposureMin?: number;
  exposureMax?: number;
  exposureSampleInterval?: number;
  shadows?: boolean;
  antialias?: boolean;
  maxDpr?: number;
}

export interface LightRigReference {
  id: string;
  type: 'ambient' | 'hemisphere' | 'directional' | 'spot' | 'point';
  color?: string;
  intensity?: number;
  node?: NodeId;
  position?: Vector3Tuple;
  target?: Vector3Tuple;
  castShadow?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SceneManifest {
  model?: SceneModelPointer;
  background?: SceneBackgroundConfig;
  spawn?: SceneSpawnConfig;
  camera?: SceneCameraConfig;
  renderer?: SceneRendererConfig;
  lights?: LightRigReference[];
}

export type SceneNodeKind =
  | 'generic'
  | 'spawn_anchor'
  | 'floor'
  | 'wall'
  | 'room'
  | 'zone'
  | 'video_surface'
  | 'video_control'
  | 'audio_anchor'
  | 'image_anchor'
  | 'document_anchor'
  | 'link_anchor'
  | 'sculpture'
  | 'light_anchor'
  | 'hotspot';

export interface SceneNodeDefinition {
  kind: SceneNodeKind;
  ref?: string;
  media?: MediaId;
  interactive?: boolean;
  visible?: boolean;
  holdRotate?: boolean;
  spawnDirection?: 'north' | 'south' | 'east' | 'west' | 'up' | 'down' | string | Vector3Tuple;
  metadata?: Record<string, unknown>;
}

export interface MediaSourceRef extends AssetPointer {
  label?: string;
}

export interface MediaDescriptorBase {
  kind: 'image' | 'document' | 'video' | 'audio' | 'text';
  title?: string;
  tooltipLabel?: string;
  description?: string;
  author?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageMediaDescriptor extends MediaDescriptorBase {
  kind: 'image';
  image: AssetPointer;
}

export interface DocumentMediaDescriptor extends MediaDescriptorBase {
  kind: 'document';
  previewImage?: AssetPointer;
  document: AssetPointer | { uri: string };
  openUri?: string;
  openLabel?: string;
}

export interface VideoMediaDescriptor extends MediaDescriptorBase {
  kind: 'video';
  poster?: AssetPointer;
  sources: MediaSourceRef[];
  subtitles?: AssetId[];
}

export interface AudioMediaDescriptor extends MediaDescriptorBase {
  kind: 'audio';
  sources: MediaSourceRef[];
  subtitles?: AssetId[];
}

export interface TextMediaDescriptor extends MediaDescriptorBase {
  kind: 'text';
  text: string;
}

export type MediaDescriptor =
  | ImageMediaDescriptor
  | DocumentMediaDescriptor
  | VideoMediaDescriptor
  | AudioMediaDescriptor
  | TextMediaDescriptor;

export type InteractionTrigger =
  | 'click'
  | 'double_click'
  | 'hover'
  | 'hold'
  | 'proximity'
  | 'collision'
  | 'enter_zone'
  | 'leave_zone'
  | 'custom';

export interface OpenImageAction {
  type: 'open_image';
  media: MediaId;
}

export interface OpenDocumentAction {
  type: 'open_document';
  media: MediaId;
}

export interface OpenVideoModalAction {
  type: 'open_video_modal';
  media: MediaId;
}

export interface PlayVideoAction {
  type: 'play_video' | 'pause_video' | 'toggle_video';
  moduleInstance: ModuleInstanceId;
}

export interface AudioControlAction {
  type: 'play_audio' | 'stop_audio' | 'toggle_audio';
  moduleInstance: ModuleInstanceId;
}

export interface OpenLinkAction {
  type: 'open_link';
  uri: string;
}

export interface EnableTransformControlsAction {
  type: 'enable_transform_controls';
  mode?: 'translate' | 'rotate' | 'scale';
  size?: number;
}

export interface ShowTextAction {
  type: 'show_text';
  media: MediaId;
}

export interface EmitEventAction {
  type: 'emit_event';
  event: string;
  payload?: Record<string, unknown>;
}

export type InteractionAction =
  | OpenImageAction
  | OpenDocumentAction
  | OpenVideoModalAction
  | PlayVideoAction
  | AudioControlAction
  | OpenLinkAction
  | EnableTransformControlsAction
  | ShowTextAction
  | EmitEventAction;

export interface InteractionUiDefinition {
  title?: string;
  description?: string;
  iconAsset?: AssetId;
  cursor?: string;
}

export interface InteractionDescriptor {
  id: InteractionId;
  targetNode: NodeId;
  trigger: InteractionTrigger;
  action: InteractionAction;
  conditions?: Record<string, unknown>;
  ui?: InteractionUiDefinition;
  metadata?: Record<string, unknown>;
}

export interface VideoSurfaceStyle {
  projection?: boolean;
  roughness?: number;
  metalness?: number;
  envMapIntensity?: number;
  emissiveIntensity?: number;
  emissiveColor?: string;
}

export interface VideoModuleInstance {
  id: ModuleInstanceId;
  targetNode: NodeId;
  media: MediaId;
  playbackMode?: 'embedded' | 'spatial_video' | 'synced_silent' | string;
  autoplayOnEnter?: boolean;
  syncGroup?: string;
  controls?: boolean;
  interactive?: boolean;
  allowFullscreen?: boolean;
  disableAudio?: boolean;
  loop?: boolean;
  muted?: boolean;
  showLoader?: boolean;
  surface?: VideoSurfaceStyle;
}

export interface VideoSyncGroup {
  id: string;
  startPolicy?: 'all_ready' | 'first_ready' | 'manual' | string;
}

export interface VideoModuleConfig {
  instances?: VideoModuleInstance[];
  syncGroups?: VideoSyncGroup[];
}

export interface AudioModuleInstance {
  id: ModuleInstanceId;
  targetNode: NodeId;
  media: MediaId;
  autoplayOnEnter?: boolean;
  autoplayDelayMs?: number;
  loop?: boolean;
  refDistance?: number;
  rolloff?: number;
  maxDistance?: number;
  distanceModel?: string;
  directionalCone?: [number, number, number];
  coneTarget?: Vector3Tuple;
  startOffset?: number;
  reverse?: boolean;
  volume?: number;
  labelPlaying?: string;
  labelPaused?: string;
}

export interface AudioModuleConfig {
  instances?: AudioModuleInstance[];
}

export interface TransformControlLightConfig {
  enabled?: boolean;
  intensity?: number;
  color?: string;
}

export interface SculptureControlInstance {
  id: ModuleInstanceId;
  targetNode: NodeId;
  mode?: 'translate' | 'rotate' | 'scale';
  size?: number;
  hover?: boolean;
  holdRotate?: boolean;
  light?: TransformControlLightConfig;
}

export interface SculptureControlsConfig {
  instances?: SculptureControlInstance[];
}

export interface ChatAgentConfig {
  id: string;
  label: string;
  systemPrompt?: string;
  systemPromptAsset?: AssetId;
  collisionPrompt?: string;
  triggers?: {
    directMessage?: boolean;
    collision?: boolean;
  };
}

export interface ChatEffectsConfig {
  surfacePrints?: boolean;
  telegramMirror?: boolean;
}

export interface ChatModuleConfig {
  enabled: boolean;
  title?: string;
  placeholder?: string;
  lockedPlaceholder?: string;
  visitorActorId?: string;
  collisionCooldownMs?: number;
  defaultAgentId?: string;
  unlock?: {
    enabled?: boolean;
  };
  agents?: ChatAgentConfig[];
  effects?: ChatEffectsConfig;
}

export interface SurfacePrintsModuleConfig {
  enabled?: boolean;
  pollMs?: number;
  fetchLimit?: number;
  maxVisible?: number;
  backgroundOpacity?: number;
  backgroundColor?: string;
}

export interface RuntimeModulesConfig {
  video?: VideoModuleConfig;
  audio?: AudioModuleConfig;
  sculptureControls?: SculptureControlsConfig;
  chat?: ChatModuleConfig;
  surfacePrints?: SurfacePrintsModuleConfig;
  custom?: Record<string, unknown>;
}

export interface ViewerCompatConfig {
  audioZones?: Record<string, unknown>[];
  lightZones?: Record<string, unknown>[];
  params?: Record<string, unknown>;
  lights?: Record<string, unknown>;
  physics?: Record<string, unknown>;
  links?: Record<string, unknown>;
  interactions?: Record<string, unknown>;
}

export interface SidebarItemDefinition {
  id: string;
  label: string;
  contentMedia?: MediaId;
  iconAsset?: AssetId;
  content?: string;
  link?: string;
  pdfPath?: string;
  pdfOpenLabel?: string;
  openLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface SidebarDefinition {
  logoText?: string;
  items?: SidebarItemDefinition[];
}

export interface ThumbnailCaptureDefinition {
  enabled?: boolean;
  cameraPosition?: Vector3Tuple;
  target?: Vector3Tuple;
  fov?: number;
  allowOrbit?: boolean;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  backgroundColor?: string;
  fps?: number;
  mimeType?: string;
  bitsPerSecond?: number;
  filename?: string;
  preset?: string;
}

export interface ExhibitConfigV2 {
  schemaVersion: string;
  id: ManifestId;
  kind?: 'exhibit';
  metadata: ExhibitMetadata;
  nft?: NftManifest;
  assets: Record<AssetId, ExhibitAsset>;
  scene: SceneManifest;
  nodes?: Record<NodeId, SceneNodeDefinition>;
  media?: Record<MediaId, MediaDescriptor>;
  interactions?: InteractionDescriptor[];
  modules?: RuntimeModulesConfig;
  viewer?: ViewerCompatConfig;
  sidebar?: SidebarDefinition;
  thumbnailCapture?: ThumbnailCaptureDefinition;
  metadataExtras?: Record<string, unknown>;
}
