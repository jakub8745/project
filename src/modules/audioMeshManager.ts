import { AudioLoader, MathUtils, PositionalAudio, type AudioListener, type Camera, type Scene, type WebGLRenderer } from 'three';
import { PositionalAudioHelper } from 'three/examples/jsm/helpers/PositionalAudioHelper.js';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { applyPitcherControls } from './applyPitcherControls.js';
import { applyObjectTransformControls, type ObjectTransformControlOptions } from './applyObjectTransformControls.js';
import { resolveObjectRuntimeData, type ObjectRegistry } from './objectRegistry.js';

type AudioDistanceModel = 'linear' | 'inverse' | 'exponential';

export interface AudioSubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface AudioSubtitleTrack {
  language: string;
  label?: string;
  cues: AudioSubtitleCue[];
}

export interface AudioMeshConfig {
  id: string;
  name?: string;
  url?: string;
  ipfsUrl?: string;
  fallbackUrls?: string[];
  autoplayOnEnter?: boolean;
  labelPlaying?: string;
  labelPaused?: string;
  loop?: boolean;
  autoplayDelayMs?: number;
  refDistance?: number;
  rolloff?: number;
  maxDistance?: number;
  distanceModel?: AudioDistanceModel;
  volume?: number;
  directionalCone?: [innerAngle: number, outerAngle: number, outerGain: number];
  coneTarget?: [x: number, y: number, z: number];
  startOffset?: number;
  reverse?: boolean;
  subtitleOffsetMs?: number;
  subtitleOffsetSeconds?: number;
  subtitleTracks?: AudioSubtitleTrack[];
  transformControls?: boolean | ObjectTransformControlOptions;
}

export interface GalleryAudioConfig {
  audio?: AudioMeshConfig[];
  objectRegistry?: ObjectRegistry;
}

export interface AudioMeshContext {
  scene: Scene;
  galleryConfig: GalleryAudioConfig;
  listener: AudioListener;
  renderer: WebGLRenderer;
  camera: Camera;
  transform?: TransformControls;
  enableHelpers?: boolean;
}

const loader = new AudioLoader();
const ipfsGateways = [
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/'
];
const audioBufferCache = new Map<string, Promise<AudioBuffer>>();

type ManagedAudio = PositionalAudio & {
  userData: PositionalAudio['userData'] & {
    __audioId?: string;
    __autoplayOnEnter?: boolean;
    __autoplayReadyAt?: number;
    __baseVolume?: number;
    __subtitleOffsetSeconds?: number;
  };
};

type PlaybackTrackedAudio = ManagedAudio & {
  _progress?: number;
  _startedAt?: number;
};

export interface AudioPlaybackSnapshot {
  id: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

interface AudioManagerState {
  available: boolean;
  isPlaying: boolean;
  volume: number;
  labelPlaying: string;
  labelPaused: string;
}

const audioObjectsRef: ManagedAudio[] = [];
let audioLoadGeneration = 0;
let desiredPlayback = false;
let controlTargetIds: Set<string> | null = null;
let pendingPlayIds = new Set<string>();
let canceledAutoplayIds = new Set<string>();
const autoplayTimers = new Map<string, ReturnType<typeof setTimeout>>();

let audioState: AudioManagerState = {
  available: false,
  isPlaying: false,
  volume: 0.5,
  labelPlaying: 'Audio is playing',
  labelPaused: 'Play Audio'
};

type AudioStateListener = (state: AudioManagerState) => void;
const listeners = new Set<AudioStateListener>();
let fallbackButton: HTMLButtonElement | null = null;
const hasDocument = typeof document !== 'undefined';

function updateFallbackControls() {
  if (!hasDocument) return;
  if (listeners.size > 0) {
    if (fallbackButton && fallbackButton.parentNode) {
      fallbackButton.parentNode.removeChild(fallbackButton);
    }
    fallbackButton = null;
    return;
  }

  if (!audioState.available) {
    if (fallbackButton) {
      fallbackButton.style.display = 'none';
    }
    return;
  }

  if (!fallbackButton) {
    fallbackButton = document.createElement('button');
    fallbackButton.type = 'button';
    Object.assign(fallbackButton.style, {
      position: 'absolute',
      bottom: '20px',
      right: '20px',
      zIndex: '29',
      width: '48px',
      height: '48px',
      borderRadius: '999px',
      border: 'none',
      backgroundColor: 'rgba(17, 24, 39, 0.65)',
      backgroundRepeat: 'no-repeat',
      backgroundSize: '26px',
      backgroundPosition: 'center',
      cursor: 'pointer'
    });
    fallbackButton.textContent = '';
    fallbackButton.setAttribute('aria-label', 'Play audio');
    fallbackButton.title = 'Play audio';
    fallbackButton.addEventListener('click', () => {
      void setAudioPlaying(!audioState.isPlaying);
    });
    document.body.appendChild(fallbackButton);
  }

  fallbackButton.style.display = 'block';
  const isPlaying = audioState.isPlaying;
  fallbackButton.style.backgroundImage = `url(${isPlaying ? '/icons/ButtonPause.png' : '/icons/ButtonPlay.png'})`;
  fallbackButton.setAttribute('aria-label', isPlaying ? 'Pause audio' : 'Play audio');
  fallbackButton.title = isPlaying ? audioState.labelPlaying : audioState.labelPaused;
}

function notifyState() {
  const snapshot = { ...audioState };
  listeners.forEach((listener) => listener(snapshot));
  updateFallbackControls();
}

function setAvailability(available: boolean) {
  if (audioState.available === available) return;
  audioState = {
    ...audioState,
    available,
    isPlaying: available ? audioState.isPlaying : false
  };
  notifyState();
}

function setPlaybackLabels(labelPlaying?: string, labelPaused?: string): void {
  const nextPlaying = typeof labelPlaying === 'string' && labelPlaying.trim() ? labelPlaying : 'Audio is playing';
  const nextPaused = typeof labelPaused === 'string' && labelPaused.trim() ? labelPaused : 'Play Audio';
  if (audioState.labelPlaying === nextPlaying && audioState.labelPaused === nextPaused) return;
  audioState = {
    ...audioState,
    labelPlaying: nextPlaying,
    labelPaused: nextPaused
  };
  notifyState();
}

function applyVolumeToSound(sound: ManagedAudio) {
  const base = typeof sound.userData?.__baseVolume === 'number' ? sound.userData.__baseVolume : 1;
  sound.setVolume(base * audioState.volume);
}

function getControlAudioObjects(): ManagedAudio[] {
  if (controlTargetIds === null) {
    return audioObjectsRef;
  }
  if (controlTargetIds.size === 0) {
    return [];
  }
  return audioObjectsRef.filter((audio) => {
    const audioId = audio.userData.__audioId || audio.name;
    return Boolean(audioId && controlTargetIds?.has(audioId));
  });
}

function normalizeIds(ids: string[]): string[] {
  return ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim());
}

function getAudioObjectsByIds(ids: string[]): ManagedAudio[] {
  const idSet = new Set(normalizeIds(ids));
  if (idSet.size === 0) {
    return [];
  }
  return audioObjectsRef.filter((audio) => {
    const audioId = audio.userData.__audioId || audio.name;
    return Boolean(audioId && idSet.has(audioId));
  });
}

function syncPlaybackState(): void {
  const controlObjects = getControlAudioObjects();
  const available = controlTargetIds === null ? audioObjectsRef.length > 0 : controlTargetIds.size > 0;
  const isPlaying = controlObjects.some((audio) => audio.isPlaying);
  if (audioState.available === available && audioState.isPlaying === isPlaying) return;
  audioState = { ...audioState, available, isPlaying: available ? isPlaying : false };
  notifyState();
}

function clearAutoplayTimer(id: string): void {
  const timer = autoplayTimers.get(id);
  if (!timer) return;
  clearTimeout(timer);
  autoplayTimers.delete(id);
}

function clearAutoplayTimers(): void {
  autoplayTimers.forEach((timer) => clearTimeout(timer));
  autoplayTimers.clear();
}

interface DisposeOptions {
  resetState?: boolean;
}

export function disposeAudioMeshes(options: DisposeOptions = {}): void {
  const { resetState = true } = options;
  audioLoadGeneration += 1;
  pendingPlayIds = new Set<string>();
  canceledAutoplayIds = new Set<string>();
  clearAutoplayTimers();
  audioObjectsRef.splice(0).forEach((sound) => {
    if (sound.isPlaying) sound.stop();
    sound.disconnect();
    sound.parent?.remove(sound);
    (sound as ManagedAudio & { buffer: AudioBuffer | null }).buffer = null;
  });
  // Decoded AudioBuffers are large. Scene teardown releases them instead of
  // retaining every exhibition visited during the session.
  audioBufferCache.clear();
  if (resetState) {
    setAvailability(false);
    updateFallbackControls();
  }
}

export function subscribeToAudioState(listener: AudioStateListener): () => void {
  listeners.add(listener);
  updateFallbackControls();
  listener({ ...audioState });
  return () => {
    listeners.delete(listener);
    updateFallbackControls();
  };
}

export async function setAudioPlaying(shouldPlay: boolean): Promise<void> {
  desiredPlayback = shouldPlay;
  const controlObjects = getControlAudioObjects();
  if (shouldPlay) {
    if (controlTargetIds && controlTargetIds.size > 0) {
      controlTargetIds.forEach((id) => pendingPlayIds.add(id));
    }
    const ctx = audioObjectsRef[0]?.context;
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
    controlObjects.forEach((audio) => {
      if (!audio.isPlaying && audio.buffer) {
        audio.play();
        const audioId = audio.userData.__audioId || audio.name;
        if (audioId) pendingPlayIds.delete(audioId);
      }
    });
    syncPlaybackState();
  } else {
    if (controlTargetIds) {
      controlTargetIds.forEach((id) => pendingPlayIds.delete(id));
    }
    controlObjects.forEach((audio) => {
      if (audio.isPlaying) {
        audio.pause();
      }
    });
    syncPlaybackState();
  }
}

export function setAudioControlTargetIds(ids?: string[] | null): void {
  controlTargetIds = Array.isArray(ids)
    ? new Set(ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))
    : null;
  syncPlaybackState();
}

export async function playAudioByIds(ids: string[]): Promise<void> {
  const normalizedIds = normalizeIds(ids);
  normalizedIds.forEach((id) => pendingPlayIds.add(id));
  const audioObjects = getAudioObjectsByIds(ids);
  const ctx = audioObjects[0]?.context ?? audioObjectsRef[0]?.context;
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume();
  }
  audioObjects.forEach((audio) => {
    if (!audio.isPlaying && audio.buffer) {
      audio.play();
      const audioId = audio.userData.__audioId || audio.name;
      if (audioId) pendingPlayIds.delete(audioId);
    }
  });
  syncPlaybackState();
}

export function stopAudioByIds(ids: string[]): void {
  normalizeIds(ids).forEach((id) => {
    pendingPlayIds.delete(id);
    canceledAutoplayIds.add(id);
    clearAutoplayTimer(id);
  });
  getAudioObjectsByIds(ids).forEach((audio) => {
    if (audio.isPlaying) {
      audio.stop();
    }
  });
  syncPlaybackState();
}

export function setAudioVolume(volume: number): void {
  const clamped = MathUtils.clamp(volume, 0, 1);
  if (audioState.volume === clamped) return;
  audioState = { ...audioState, volume: clamped };
  audioObjectsRef.forEach((sound) => applyVolumeToSound(sound));
  notifyState();
}

export function getAudioState(): AudioManagerState {
  return { ...audioState };
}

export function getAudioPlaybackSnapshot(id: string): AudioPlaybackSnapshot | null {
  const audio = getAudioObjectsByIds([id])[0] as PlaybackTrackedAudio | undefined;
  if (!audio?.buffer) {
    return null;
  }

  const progress = typeof audio._progress === 'number' ? audio._progress : 0;
  const startedAt = typeof audio._startedAt === 'number' ? audio._startedAt : audio.context.currentTime;
  const playbackRate = typeof audio.playbackRate === 'number' && Number.isFinite(audio.playbackRate)
    ? audio.playbackRate
    : 1;
  const elapsed = audio.isPlaying
    ? Math.max(audio.context.currentTime - startedAt, 0) * playbackRate
    : 0;
  const duration = audio.duration ?? audio.buffer.duration;
  const playableDuration = Number.isFinite(duration) && duration > 0 ? duration : audio.buffer.duration;
  const rawCurrentTime = audio.offset + progress + elapsed;
  const normalizedCurrentTime =
    audio.loop && playableDuration > 0
      ? rawCurrentTime % playableDuration
      : MathUtils.clamp(rawCurrentTime, 0, playableDuration);
  const subtitleOffset = typeof audio.userData.__subtitleOffsetSeconds === 'number'
    ? audio.userData.__subtitleOffsetSeconds
    : 0;

  return {
    id,
    currentTime: MathUtils.clamp(normalizedCurrentTime + subtitleOffset, 0, playableDuration),
    duration: playableDuration,
    isPlaying: audio.isPlaying
  };
}

export async function unlockAudioPlayback(): Promise<void> {
  if (!desiredPlayback) {
    return;
  }
  const ctx = audioObjectsRef[0]?.context;
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume();
  }
  audioObjectsRef.forEach((audio) => {
    const audioId = audio.userData.__audioId || audio.name;
    if (!audio.userData.__autoplayOnEnter || (audioId && canceledAutoplayIds.has(audioId))) return;
    const readyAt = typeof audio.userData.__autoplayReadyAt === 'number' ? audio.userData.__autoplayReadyAt : 0;
    if (readyAt > performance.now()) {
      scheduleAutoplay(audio, audioLoadGeneration);
      return;
    }
    if (!audio.isPlaying && audio.buffer) {
      audio.play();
    }
  });
  syncPlaybackState();
}

function tryPlayAutoplayAudio(sound: ManagedAudio, generation: number): void {
  const audioId = sound.userData.__audioId || sound.name;
  if (generation !== audioLoadGeneration || !desiredPlayback || !sound.buffer) return;
  if (audioId && canceledAutoplayIds.has(audioId)) return;
  const ctx = sound.context;
  if (ctx.state === 'suspended') {
    ctx.resume()
      .then(() => {
        if (generation !== audioLoadGeneration || !desiredPlayback) return;
        if (audioId && canceledAutoplayIds.has(audioId)) return;
        if (!sound.isPlaying) sound.play();
        syncPlaybackState();
      })
      .catch(() => {
        syncPlaybackState();
      });
    return;
  }
  if (!sound.isPlaying) {
    sound.play();
    syncPlaybackState();
  }
}

function scheduleAutoplay(sound: ManagedAudio, generation: number): void {
  const audioId = sound.userData.__audioId || sound.name;
  if (!audioId) {
    tryPlayAutoplayAudio(sound, generation);
    return;
  }
  clearAutoplayTimer(audioId);
  const readyAt = typeof sound.userData.__autoplayReadyAt === 'number' ? sound.userData.__autoplayReadyAt : 0;
  const delayMs = Math.max(0, readyAt - performance.now());
  if (delayMs <= 0) {
    tryPlayAutoplayAudio(sound, generation);
    return;
  }
  const timer = setTimeout(() => {
    autoplayTimers.delete(audioId);
    tryPlayAutoplayAudio(sound, generation);
  }, delayMs);
  autoplayTimers.set(audioId, timer);
}

function loadAudioWithFallback(
  cfg: AudioMeshConfig,
  onSuccess: (buffer: AudioBuffer) => void
) {
  const primary = cfg?.url ?? '';
  const ipfsUrl = cfg?.ipfsUrl || (typeof primary === 'string' && primary.startsWith('ipfs://') ? primary : null);
  const fallbackUrls = Array.isArray(cfg?.fallbackUrls)
    ? cfg.fallbackUrls.filter((url) => typeof url === 'string' && url.trim())
    : [];

  const loadAudioBuffer = (url: string): Promise<AudioBuffer> => {
    const cached = audioBufferCache.get(url);
    if (cached) return cached;
    const pending = new Promise<AudioBuffer>((resolve, reject) => {
      loader.load(url, (buffer) => resolve(buffer), undefined, reject);
    });
    audioBufferCache.set(url, pending);
    pending.catch(() => {
      audioBufferCache.delete(url);
    });
    return pending;
  };

  const tryIpfs = (gwIndex = 0): Promise<AudioBuffer> => {
    if (!ipfsUrl) {
      console.error(`[AudioMesh] Primary failed and no IPFS fallback for ${cfg?.id || cfg?.name}`);
      return Promise.reject(new Error('No IPFS fallback configured'));
    }
    if (gwIndex >= ipfsGateways.length) {
      console.error(`[AudioMesh] Failed to load audio from all gateways: ${ipfsUrl}`);
      return Promise.reject(new Error(`Failed to load audio from all gateways: ${ipfsUrl}`));
    }
    const cid = ipfsUrl.replace('ipfs://', '');
    const url = ipfsGateways[gwIndex] + cid;
    return loadAudioBuffer(url).catch(() => {
        console.warn(`[AudioMesh] IPFS gateway failed (${gwIndex + 1}/${ipfsGateways.length}), retrying...`);
        return tryIpfs(gwIndex + 1);
      });
  };

  const tryFallback = (index = 0): Promise<AudioBuffer> => {
    if (index >= fallbackUrls.length) return tryIpfs(0);
    return loadAudioBuffer(fallbackUrls[index]).catch(() => tryFallback(index + 1));
  };

  const tryPrimary = (): Promise<AudioBuffer> => {
    if (typeof primary === 'string' && primary.startsWith('ipfs://')) {
      return tryIpfs(0);
    }
    if (!primary) {
      return tryFallback(0);
    }
    return loadAudioBuffer(primary).catch(() => {
        console.warn(`[AudioMesh] Primary failed, trying configured fallbacks: ${primary}`);
        return tryFallback(0);
      });
  };

  void tryPrimary()
    .then((buffer) => onSuccess(buffer))
    .catch(() => undefined);
}

function reverseAudioBuffer(buffer: AudioBuffer, context: BaseAudioContext): AudioBuffer {
  const reversed = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel);
    const target = reversed.getChannelData(channel);
    for (let i = 0, j = source.length - 1; i < source.length; i += 1, j -= 1) {
      target[i] = source[j];
    }
  }
  return reversed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function resolveTransformControlOptions(
  runtimeData: ReturnType<typeof resolveObjectRuntimeData>,
  cfg: AudioMeshConfig | undefined,
  type: string | undefined
): ObjectTransformControlOptions | null {
  const entry = asRecord(runtimeData?.entry);
  const interactions = asRecord(entry?.interactions);
  const raw =
    entry?.transformControls ??
    entry?.transform ??
    interactions?.transformControls ??
    interactions?.gizmo ??
    cfg?.transformControls;

  if (raw === false) return null;
  if (raw === true) return {};
  const rawRecord = asRecord(raw);
  if (rawRecord) return rawRecord as ObjectTransformControlOptions;
  return type === 'Pitcher' ? {} : null;
}

export function applyAudioMeshes(context: AudioMeshContext): void {
  const { scene, galleryConfig, listener, renderer, camera, transform } = context;

  const configMap = new Map((galleryConfig.audio || []).map((cfg) => [cfg.id, cfg]));
  const labelConfig = (galleryConfig.audio || []).find(
    (cfg) => typeof cfg.labelPlaying === 'string' || typeof cfg.labelPaused === 'string'
  );
  setPlaybackLabels(labelConfig?.labelPlaying, labelConfig?.labelPaused);
  setAudioControlTargetIds(labelConfig ? [labelConfig.id] : null);
  const shouldAutoplayOnEnter = (galleryConfig.audio || []).some((cfg) => cfg.autoplayOnEnter === true);
  desiredPlayback = shouldAutoplayOnEnter;

  disposeAudioMeshes({ resetState: false });
  const generation = audioLoadGeneration;
  const sceneReadyAt = performance.now();

  let foundAny = false;

  scene.traverse((obj) => {
    const runtimeData = resolveObjectRuntimeData(obj, galleryConfig.objectRegistry);
    const type = runtimeData?.type || obj.userData?.type;
    const audioId = runtimeData?.ref || obj.userData.name || obj.name;
    const cfg = configMap.get(audioId);
    if (type === 'Audio' || type === 'Pitcher') {
      if (!cfg) {
        console.warn(`No audio config for ID ${audioId}`);
      } else {

        foundAny = true;

        const sound = new PositionalAudio(listener) as ManagedAudio;
        sound.name = cfg.name || audioId || obj.name;
        sound.userData.__audioId = audioId;

        loadAudioWithFallback(cfg, (buffer) => {
          if (generation !== audioLoadGeneration) return;
          const playbackBuffer = cfg.reverse ? reverseAudioBuffer(buffer, sound.context) : buffer;
          const baseOnEnded = sound.onEnded.bind(sound);
          sound.onEnded = () => {
            baseOnEnded();
            syncPlaybackState();
          };
          sound.setBuffer(playbackBuffer);
          sound.setLoop(cfg.loop ?? true);
          sound.setRefDistance(cfg.refDistance ?? 1);
          sound.setRolloffFactor(cfg.rolloff ?? 1);
          sound.setMaxDistance(cfg.maxDistance ?? 5);
          sound.setDistanceModel(cfg.distanceModel ?? 'linear');
          if (typeof cfg.startOffset === 'number' && Number.isFinite(cfg.startOffset)) {
            sound.offset = Math.max(0, cfg.startOffset);
          }
          const baseVolume = cfg.volume ?? 1;
          sound.userData.__autoplayOnEnter = cfg.autoplayOnEnter === true;
          sound.userData.__autoplayReadyAt = sceneReadyAt + Math.max(0, cfg.autoplayDelayMs ?? 0);
          sound.userData.__baseVolume = baseVolume;
          sound.userData.__subtitleOffsetSeconds =
            typeof cfg.subtitleOffsetSeconds === 'number' && Number.isFinite(cfg.subtitleOffsetSeconds)
              ? cfg.subtitleOffsetSeconds
              : typeof cfg.subtitleOffsetMs === 'number' && Number.isFinite(cfg.subtitleOffsetMs)
                ? cfg.subtitleOffsetMs / 1000
                : 0;
          applyVolumeToSound(sound);
          if (Array.isArray(cfg.directionalCone)) {
            sound.setDirectionalCone(...cfg.directionalCone);
          }

          if (context.enableHelpers) {
            const helper = new PositionalAudioHelper(sound, (cfg.refDistance ?? 1) * 2);
            sound.add(helper);
          }

          obj.add(sound);
          audioObjectsRef.push(sound);
          syncPlaybackState();

          if (desiredPlayback && sound.userData.__autoplayOnEnter) {
            scheduleAutoplay(sound, generation);
          } else if (pendingPlayIds.has(audioId)) {
            const ctx = sound.context;
            if (ctx.state === 'suspended') {
              ctx.resume().then(() => {
                if (!sound.isPlaying) sound.play();
                pendingPlayIds.delete(audioId);
                syncPlaybackState();
              });
            } else if (!sound.isPlaying) {
              if (!sound.isPlaying) sound.play();
              pendingPlayIds.delete(audioId);
              syncPlaybackState();
            }
          }
        });

        obj.scale.setScalar(0.1);
        if (Array.isArray(cfg.coneTarget)) {
          obj.lookAt(cfg.coneTarget[0], cfg.coneTarget[1], cfg.coneTarget[2]);
        } else {
          obj.rotateX(Math.PI / 2);
          obj.rotation.y += MathUtils.degToRad(120);
        }
      }
    }

    const transformOptions = resolveTransformControlOptions(runtimeData, cfg, type);
    if (transform && transformOptions) {
      if (type === 'Pitcher' && !runtimeData?.entry?.transformControls) {
        applyPitcherControls(obj, scene, renderer, camera, transform, transformOptions);
      } else {
        applyObjectTransformControls(obj, scene, renderer, camera, transform, transformOptions);
      }
    }
  });

  setAvailability(foundAny);
}
