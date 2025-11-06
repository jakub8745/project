import { AudioLoader, MathUtils, PositionalAudio, type AudioListener, type Camera, type Scene, type WebGLRenderer } from 'three';
import { PositionalAudioHelper } from 'three/examples/jsm/helpers/PositionalAudioHelper.js';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { applyPitcherControls } from './applyPitcherControls.js';

export interface AudioMeshConfig {
  id: string;
  name?: string;
  url?: string;
  ipfsUrl?: string;
  loop?: boolean;
  refDistance?: number;
  rolloff?: number;
  maxDistance?: number;
  distanceModel?: string;
  volume?: number;
  directionalCone?: [innerAngle: number, outerAngle: number, outerGain: number];
}

export interface GalleryAudioConfig {
  audio?: AudioMeshConfig[];
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

type ManagedAudio = PositionalAudio & {
  userData: PositionalAudio['userData'] & { __baseVolume?: number };
};

interface AudioManagerState {
  available: boolean;
  isPlaying: boolean;
  volume: number;
}

const audioObjectsRef: ManagedAudio[] = [];

let audioState: AudioManagerState = {
  available: false,
  isPlaying: false,
  volume: 1
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
  fallbackButton.title = isPlaying ? 'Pause audio' : 'Play audio';
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

function applyVolumeToSound(sound: ManagedAudio) {
  const base = typeof sound.userData?.__baseVolume === 'number' ? sound.userData.__baseVolume : 1;
  sound.setVolume(base * audioState.volume);
}

interface DisposeOptions {
  resetState?: boolean;
}

export function disposeAudioMeshes(options: DisposeOptions = {}): void {
  const { resetState = true } = options;
  audioObjectsRef.splice(0).forEach((sound) => {
    if (sound.isPlaying) sound.stop();
    sound.disconnect();
    sound.parent?.remove(sound);
  });
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
  if (shouldPlay) {
    const ctx = audioObjectsRef[0]?.context;
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
    audioObjectsRef.forEach((audio) => {
      if (!audio.isPlaying && audio.buffer) {
        audio.play();
      }
    });
  } else {
    audioObjectsRef.forEach((audio) => {
      if (audio.isPlaying) {
        audio.pause();
      }
    });
  }

  if (audioState.isPlaying !== shouldPlay) {
    audioState = { ...audioState, isPlaying: shouldPlay };
    notifyState();
  }
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

function loadAudioWithFallback(
  cfg: AudioMeshConfig,
  onSuccess: (buffer: AudioBuffer) => void
) {
  const primary = cfg?.url ?? '';
  const ipfsUrl = cfg?.ipfsUrl || (typeof primary === 'string' && primary.startsWith('ipfs://') ? primary : null);

  const tryIpfs = (gwIndex = 0) => {
    if (!ipfsUrl) {
      console.error(`[AudioMesh] Primary failed and no IPFS fallback for ${cfg?.id || cfg?.name}`);
      return;
    }
    if (gwIndex >= ipfsGateways.length) {
      console.error(`[AudioMesh] Failed to load audio from all gateways: ${ipfsUrl}`);
      return;
    }
    const cid = ipfsUrl.replace('ipfs://', '');
    const url = ipfsGateways[gwIndex] + cid;
    loader.load(
      url,
      (buffer) => onSuccess(buffer),
      undefined,
      () => {
        console.warn(`[AudioMesh] IPFS gateway failed (${gwIndex + 1}/${ipfsGateways.length}), retrying...`);
        tryIpfs(gwIndex + 1);
      }
    );
  };

  const tryPrimary = () => {
    if (typeof primary === 'string' && primary.startsWith('ipfs://')) {
      tryIpfs(0);
      return;
    }
    if (!primary) {
      tryIpfs(0);
      return;
    }
    loader.load(
      primary,
      (buffer) => onSuccess(buffer),
      undefined,
      () => {
        console.warn(`[AudioMesh] Primary failed, falling back to IPFS: ${primary}`);
        tryIpfs(0);
      }
    );
  };

  tryPrimary();
}



export function applyAudioMeshes(context: AudioMeshContext): void {
  const { scene, galleryConfig, listener, renderer, camera, transform } = context;

  const configMap = new Map((galleryConfig.audio || []).map((cfg) => [cfg.id, cfg]));

  disposeAudioMeshes({ resetState: false });

  let foundAny = false;

  scene.traverse((obj) => {
    const type = obj.userData?.type;
    if (type === 'Audio' || type === 'Pitcher') {
      const cfg = configMap.get(obj.userData.name);
      if (!cfg) {
        console.warn(`No audio config for ID ${obj.userData.name}`);
        return;
      }

      foundAny = true;

      const sound = new PositionalAudio(listener) as ManagedAudio;
      sound.name = cfg.name || obj.userData.name || obj.name;

      loadAudioWithFallback(cfg, (buffer) => {
        sound.setBuffer(buffer);
        sound.setLoop(cfg.loop ?? true);
        sound.setRefDistance(cfg.refDistance ?? 1);
        sound.setRolloffFactor(cfg.rolloff ?? 1);
        sound.setMaxDistance(cfg.maxDistance ?? 5);
        sound.setDistanceModel(cfg.distanceModel ?? 'linear');
        const baseVolume = cfg.volume ?? 1;
        sound.userData.__baseVolume = baseVolume;
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

        if (audioState.isPlaying) {
          const ctx = sound.context;
          if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
              if (!sound.isPlaying) sound.play();
            });
          } else if (!sound.isPlaying) {
            sound.play();
          }
        }
      });

      obj.scale.setScalar(0.1);
      obj.rotateX(Math.PI / 2);
      obj.rotation.y += MathUtils.degToRad(120);
    }

    if (type === 'Pitcher' && transform) {
      applyPitcherControls(obj, scene, renderer, camera, transform);
    }
  });

  setAvailability(foundAny);
}
