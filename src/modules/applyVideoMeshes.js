import {
  VideoTexture,
  TextureLoader,
  CanvasTexture,
  MeshBasicMaterial,
  DoubleSide,
  SRGBColorSpace,
  LinearFilter,
  PlaneGeometry,
  Vector3,
  Quaternion,
  Mesh,
  Raycaster,
  PositionalAudio,
  AudioListener,
  Color
} from 'three';
import { resolveVideoPlaybackMode } from './videoPlaybackMode.js';
import { resolveObjectRuntimeData } from './objectRegistry.js';

const PLAY_ICON_PATH =
  'https://bafybeieawhqdesjes54to4u6gmqwzvpzlp2o5ncumaqw3nfiv2mui6i6q4.ipfs.w3s.link/ButtonPlay.png';

const IPFS_GATEWAYS = [
  "https://cloudflare-ipfs.com/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/"
];

const DEFAULT_VOLUME = 0.66;
const MAX_OVERLAY_DISTANCE = 4; // hide controls when user is far
const _overlayDisposers = new Set(); // track active HTML overlay cleanup fns
const _controlIconTextureCache = new Map();
const PLAY_ICON_URL = '/icons/ButtonPlay.png';
const PAUSE_ICON_URL = '/icons/ButtonPause.png';

// --- Step 1: resource cache ---
const _videoResourceCache = new Map(); // id -> { video, texture }
const _syncPlaybackGroups = new Map(); // groupId -> sync state
let _videoScenePlaybackEnabled = false;

export function setVideoScenePlaybackEnabled(enabled) {
  _videoScenePlaybackEnabled = enabled === true;
  if (!_videoScenePlaybackEnabled) return;
  _syncPlaybackGroups.forEach((group) => {
    if (typeof group?.tryStart === 'function') {
      group.tryStart();
    }
  });
}

function getVideoResource(id) {
  return _videoResourceCache.get(id) || {};
}

function setVideoResource(id, data) {
  const prev = _videoResourceCache.get(id);
  // If we’re replacing a previous texture, dispose it to free GPU memory
  if (prev?.texture && data.texture && prev.texture !== data.texture) {
    prev.texture.dispose();
  }
  _videoResourceCache.set(id, { ...prev, ...data });
}

function getPrimaryVideoSource(cfg) {
  const srcObj = Array.isArray(cfg?.sources) ? cfg.sources[0] : null;
  const primary = typeof srcObj?.src === 'string' ? srcObj.src : '';
  const ipfsUrl = typeof srcObj?.ipfsSrc === 'string'
    ? srcObj.ipfsSrc
    : primary.startsWith('ipfs://')
      ? primary
      : null;
  return { srcObj, primary, ipfsUrl };
}

function shouldDeferVideoLoad(cfg) {
  if (!cfg) return false;
  if (cfg.autoplayOnEnter === true) return false;
  if (cfg.deferLoadUntilPlay === true) return true;
  return typeof cfg.preload === 'string' && cfg.preload.toLowerCase() === 'none';
}

function loadVideoSource(video, cfg) {
  if (!(video instanceof HTMLVideoElement) || !cfg?.id) return false;
  const existing = getVideoResource(cfg.id);
  if (existing.sourceLoaded || existing.sourceLoading || video.currentSrc || video.src) return true;

  const { srcObj, primary, ipfsUrl } = getPrimaryVideoSource(cfg);
  if (!srcObj && !primary && !ipfsUrl) return false;

  setVideoResource(cfg.id, { sourceLoading: true });

  const ipfsGateways = IPFS_GATEWAYS;
  let gwIndex = 0;
  const markLoaded = () => {
    setVideoResource(cfg.id, { sourceLoaded: true, sourceLoading: false });
  };
  const markFailed = () => {
    setVideoResource(cfg.id, { sourceLoading: false });
  };
  const loadIpfs = () => {
    if (!ipfsUrl) {
      console.error(`[VideoMesh] Primary failed and no IPFS fallback: ${primary}`);
      markFailed();
      return;
    }
    if (gwIndex >= ipfsGateways.length) {
      console.error(`[VideoMesh] Failed to load video from all gateways: ${ipfsUrl}`);
      markFailed();
      return;
    }
    const cid = ipfsUrl.replace("ipfs://", "");
    const src = ipfsGateways[gwIndex] + cid;
    gwIndex++;
    video.src = src;
    video.type = srcObj?.type || '';
    video.load();
    video.onerror = () => {
      console.warn(`[VideoMesh] Retrying IPFS gateway ${gwIndex}/${ipfsGateways.length}`);
      setTimeout(loadIpfs, 200);
    };
    markLoaded();
  };

  const loadPrimary = () => {
    if (typeof primary === 'string' && primary.startsWith('ipfs://')) {
      loadIpfs();
      return;
    }
    if (!primary) {
      loadIpfs();
      return;
    }
    video.src = primary;
    video.type = srcObj?.type || '';
    video.load();
    video.onerror = () => {
      console.warn(`[VideoMesh] Primary source failed, falling back to IPFS: ${primary}`);
      setVideoResource(cfg.id, { sourceLoaded: false, sourceLoading: false });
      loadIpfs();
    };
    markLoaded();
  };

  loadPrimary();
  return true;
}

function disposeVideoResource(id) {
  const res = _videoResourceCache.get(id);
  if (!res) return;
  if (res.texture) res.texture.dispose(); // free GPU memory
  if (res.posterTexture) res.posterTexture.dispose();
  if (res.positionalAudio) {
    try {
      res.positionalAudio.stop();
    } catch {
      /* ignore */
    }
    res.positionalAudio.disconnect();
    res.positionalAudio.parent?.remove(res.positionalAudio);
  }
  if (res.audioSourceNode) {
    try {
      res.audioSourceNode.disconnect();
    } catch {
      /* ignore */
    }
  }
  if (res.video) {
    try {
      res.video.pause();
      res.video.removeAttribute('src');
      res.video.load();
    } catch {
      // ignore cleanup errors
    }
    if (res.video.parentNode) {
      res.video.parentNode.removeChild(res.video);
    }
  }
  _videoResourceCache.delete(id);
}

function getCachedTexture(key, factory) {
  const existing = _controlIconTextureCache.get(key);
  if (existing) return existing;
  const texture = factory();
  _controlIconTextureCache.set(key, texture);
  return texture;
}

function getImageIconTexture(url) {
  return getCachedTexture(`img:${url}`, () => {
    const texture = new TextureLoader().load(url);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  });
}

function getGlyphIconTexture(kind) {
  return getCachedTexture(`glyph:${kind}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.clearRect(0, 0, 128, 128);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#f8fafc';
    ctx.fillStyle = '#f8fafc';
    ctx.lineWidth = 12;

    if (kind === 'vol_up' || kind === 'vol_down' || kind === 'mute' || kind === 'unmute') {
      ctx.beginPath();
      ctx.moveTo(20, 52);
      ctx.lineTo(34, 52);
      ctx.lineTo(54, 34);
      ctx.lineTo(54, 94);
      ctx.lineTo(34, 76);
      ctx.lineTo(20, 76);
      ctx.closePath();
      ctx.fill();
    }

    if (kind === 'vol_up') {
      ctx.beginPath();
      ctx.arc(62, 64, 20, -0.8, 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(62, 64, 32, -0.8, 0.8);
      ctx.stroke();
    } else if (kind === 'vol_down') {
      ctx.beginPath();
      ctx.arc(62, 64, 20, -0.8, 0.8);
      ctx.stroke();
    } else if (kind === 'mute') {
      ctx.beginPath();
      ctx.moveTo(64, 42);
      ctx.lineTo(102, 86);
      ctx.moveTo(102, 42);
      ctx.lineTo(64, 86);
      ctx.stroke();
    } else if (kind === 'unmute') {
      ctx.beginPath();
      ctx.arc(62, 64, 20, -0.8, 0.8);
      ctx.stroke();
    } else if (kind === 'fullscreen') {
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(28, 48); ctx.lineTo(28, 28); ctx.lineTo(48, 28);
      ctx.moveTo(80, 28); ctx.lineTo(100, 28); ctx.lineTo(100, 48);
      ctx.moveTo(28, 80); ctx.lineTo(28, 100); ctx.lineTo(48, 100);
      ctx.moveTo(80, 100); ctx.lineTo(100, 100); ctx.lineTo(100, 80);
      ctx.stroke();
    } else if (kind === 'dot') {
      ctx.beginPath();
      ctx.fillStyle = '#e2e8f0';
      ctx.arc(64, 64, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  });
}

function openVideoPlayer(cfg, video) {
  if (typeof document === 'undefined' || !(video instanceof HTMLVideoElement)) return false;

  const dispatchModalState = (open) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('video-player-modal-state', {
        detail: { open }
      })
    );
  };

  const overlay = document.createElement('div');
  overlay.className = 'video-modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'video-modal';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'video-modal__close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close video');
  const modalVideo = document.createElement('video');
  modalVideo.className = 'video-modal__video';
  modalVideo.controls = true;
  modalVideo.autoplay = true;
  modalVideo.playsInline = true;
  modalVideo.muted = false;
  modalVideo.volume = Math.min(Math.max(video.volume ?? DEFAULT_VOLUME, 0), 1);
  const poster = resolvePosterUrl(cfg);
  if (poster) modalVideo.poster = poster;

  const primarySource =
    video.currentSrc ||
    video.src ||
    (Array.isArray(cfg?.sources) ? cfg.sources[0]?.src : undefined) ||
    '';
  if (primarySource) {
    const sourceEl = document.createElement('source');
    sourceEl.src = primarySource;
    sourceEl.type = (Array.isArray(cfg?.sources) ? cfg.sources[0]?.type : undefined) || '';
    modalVideo.appendChild(sourceEl);
  }

  modal.appendChild(closeBtn);
  modal.appendChild(modalVideo);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  dispatchModalState(true);

  const wasPlaying = !video.paused && !video.ended;
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  video.pause();
  const audioListener = getVideoResource(cfg?.id)?.audioListener;
  audioListener?.context?.resume?.().catch?.(() => {});

  const syncBack = () => {
    if (Number.isFinite(modalVideo.currentTime)) {
      try {
        video.currentTime = modalVideo.currentTime;
      } catch {
        /* ignore */
      }
    }
    if (wasPlaying) {
      setVideoResource(cfg.id, { userMuted: false });
      loadVideoSource(video, cfg);
      resumeVideoAudio(getVideoResource(cfg.id));
      video.play().catch(() => {});
    }
  };

  const close = () => {
    modalVideo.pause();
    syncBack();
    overlay.removeEventListener('click', overlayHandler);
    closeBtn.removeEventListener('click', closeHandler);
    document.removeEventListener('keydown', escHandler);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    dispatchModalState(false);
  };

  const overlayHandler = (evt) => {
    if (evt.target === overlay) close();
  };
  const closeHandler = (evt) => {
    evt.stopPropagation();
    close();
  };
  const escHandler = (evt) => {
    if (evt.key === 'Escape') {
      evt.preventDefault();
      close();
    }
  };

  overlay.addEventListener('click', overlayHandler);
  closeBtn.addEventListener('click', closeHandler);
  document.addEventListener('keydown', escHandler);

  const setStartTime = () => {
    if (Number.isFinite(currentTime) && modalVideo.readyState >= 1) {
      modalVideo.currentTime = currentTime;
    }
  };
  if (modalVideo.readyState >= 1) {
    setStartTime();
  } else {
    modalVideo.addEventListener('loadedmetadata', setStartTime, { once: true });
  }
  modalVideo.play().catch(() => {});
  return true;
}

export function openVideoPlayerById(videoId) {
  if (!_videoScenePlaybackEnabled) return false;
  if (!videoId) return false;
  const resource = getVideoResource(videoId);
  const video = resource?.video;
  if (!(video instanceof HTMLVideoElement)) return false;
  const cfg = resource?.cfg || { id: videoId };
  const mode = resource?.playbackMode || resolveVideoPlaybackMode(cfg);
  if (mode === 'synced_silent') return false;
  if (cfg?.allowFullscreen === false) return false;
  // User gesture: treat opening modal as intent to enable audio for this video.
  setVideoResource(videoId, { userMuted: false });
  resumeVideoAudio(getVideoResource(videoId));
  return openVideoPlayer(cfg, video);
}

export function disposeAllVideoMeshes() {
  _videoScenePlaybackEnabled = false;
  _overlayDisposers.forEach((dispose) => {
    try {
      dispose();
    } catch {
      /* ignore */
    }
  });
  _overlayDisposers.clear();
  Array.from(_videoResourceCache.keys()).forEach((id) => disposeVideoResource(id));
  _syncPlaybackGroups.clear();
}

function getMeshDisposers(mesh) {
  if (!Array.isArray(mesh.userData._videoDisposers)) {
    mesh.userData._videoDisposers = [];
  }
  return mesh.userData._videoDisposers;
}

function cleanupMeshDecorations(mesh) {
  const disposers = mesh.userData._videoDisposers;
  if (!Array.isArray(disposers) || disposers.length === 0) return;
  while (disposers.length) {
    const dispose = disposers.pop();
    try {
      dispose?.();
    } catch (err) {
      console.warn('[VideoMesh] cleanup failed', err);
    }
  }
}

function isInternalVideoObject(object) {
  const userData = object?.userData;
  return userData?.__isVideoControlProxy === true || userData?.__isVideoDecoration === true;
}

function isVideoReadyForPlayback(video) {
  return video instanceof HTMLVideoElement && video.readyState >= 2;
}

function createSyncPlaybackGroups(videos) {
  const groups = new Map();
  for (const cfg of videos || []) {
    if (cfg?.autoplayOnEnter !== true) continue;
    const groupId = typeof cfg.syncStartGroup === 'string' && cfg.syncStartGroup ? cfg.syncStartGroup : cfg.id;
    if (!groupId) continue;
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        expectedIds: new Set(),
        videos: new Map(),
        readyIds: new Set(),
        started: false,
        tryStart: null
      });
    }
    groups.get(groupId).expectedIds.add(cfg.id);
  }
  return groups;
}

function queueSyncedPlayback(cfg, video, syncGroups) {
  if (!cfg || cfg.autoplayOnEnter !== true || !(video instanceof HTMLVideoElement)) return null;
  const groupId = typeof cfg.syncStartGroup === 'string' && cfg.syncStartGroup ? cfg.syncStartGroup : cfg.id;
  const group = groupId ? syncGroups.get(groupId) : null;
  if (!group) return null;

  group.videos.set(cfg.id, video);
  _syncPlaybackGroups.set(groupId, group);

  const tryStart = () => {
    if (!_videoScenePlaybackEnabled) return;
    if (group.started) return;
    if (group.videos.size < group.expectedIds.size) return;
    for (const id of group.expectedIds) {
      if (!group.videos.has(id) || !group.readyIds.has(id)) {
        return;
      }
    }
    group.started = true;
    const targets = [];
    for (const id of group.expectedIds) {
      const target = group.videos.get(id);
      if (target instanceof HTMLVideoElement) {
        targets.push(target);
      }
    }
    targets.forEach((targetVideo) => {
      try {
        targetVideo.currentTime = 0;
      } catch {
        /* ignore */
      }
    });
    requestAnimationFrame(() => {
      targets.forEach((targetVideo) => {
        targetVideo.play().catch(() => {});
      });
    });
  };
  group.tryStart = tryStart;

  const markReady = () => {
    group.readyIds.add(cfg.id);
    tryStart();
  };

  if (isVideoReadyForPlayback(video)) {
    markReady();
  }

  const readyEvents = ['loadeddata', 'canplay', 'canplaythrough'];
  readyEvents.forEach((evt) => video.addEventListener(evt, markReady));

  return () => {
    readyEvents.forEach((evt) => video.removeEventListener(evt, markReady));
    group.videos.delete(cfg.id);
    group.readyIds.delete(cfg.id);
  };
}

function resolvePosterUrl(cfg) {
  if (!cfg) return null;
  const poster = typeof cfg.poster === 'string' ? cfg.poster : undefined;
  const oraclePoster = typeof cfg.oraclePoster === 'string' ? cfg.oraclePoster : undefined;
  const ipfsPoster = typeof cfg.ipfsPoster === 'string' ? cfg.ipfsPoster : undefined;
  const candidate = poster || oraclePoster || ipfsPoster;
  if (!candidate) return null;
  if (candidate.startsWith('ipfs://')) {
    const cid = candidate.replace('ipfs://', '');
    return `${IPFS_GATEWAYS[0]}${cid}`;
  }
  return candidate;
}

function ensureListener(camera) {
  if (!camera) return null;
  let listener = camera.children.find((child) => child instanceof AudioListener);
  if (!listener) {
    listener = new AudioListener();
    camera.add(listener);
  }
  return listener;
}

function attachPositionalAudio(mesh, video, camera, cfg) {
  const listener = ensureListener(camera);
  if (!listener) return null;

  const existing = getVideoResource(cfg.id);
  if (existing.positionalAudio) {
    mesh.add(existing.positionalAudio);
    return () => {
      existing.positionalAudio.parent?.remove(existing.positionalAudio);
    };
  }

  const positionalAudio = new PositionalAudio(listener);
  positionalAudio.setRefDistance(3);
  positionalAudio.setRolloffFactor(1);
  positionalAudio.setDistanceModel('inverse');
  positionalAudio.setVolume(Math.min(Math.max(video.volume ?? DEFAULT_VOLUME, 0), 1));

  try {
    positionalAudio.setMediaElementSource(video);
  } catch (err) {
    console.warn('Failed to attach positional audio', err);
    return null;
  }

  // Center of mesh bounds
  const { center } = getWorldBounds(mesh);
  positionalAudio.position.copy(center);
  mesh.add(positionalAudio);

  setVideoResource(cfg.id, { ...existing, positionalAudio, audioSourceNode: positionalAudio.source, audioListener: listener });
  resumeVideoAudio(getVideoResource(cfg.id));

  return () => {
    try {
      positionalAudio.stop();
    } catch {
      /* ignore */
    }
    positionalAudio.disconnect();
    positionalAudio.parent?.remove(positionalAudio);
  };
}

function resolveDesiredVolume(cfg, video, resource) {
  if (resource && typeof resource.userVolume === 'number' && Number.isFinite(resource.userVolume)) {
    return Math.min(Math.max(resource.userVolume, 0), 1);
  }
  if (cfg && typeof cfg.volume === 'number' && Number.isFinite(cfg.volume)) {
    return Math.min(Math.max(cfg.volume, 0), 1);
  }
  if (typeof video?.volume === 'number' && Number.isFinite(video.volume) && video.volume > 0) {
    return Math.min(Math.max(video.volume, 0), 1);
  }
  return DEFAULT_VOLUME;
}

function resumeVideoAudio(resource) {
  const video = resource?.video;
  const cfg = resource?.cfg;
  if (!(video instanceof HTMLVideoElement)) return false;
  const videoId = (cfg && typeof cfg.id === 'string' && cfg.id) || video.id;

  const allowAudio = cfg?.disableAudio !== true;
  if (!allowAudio) return false;

  // Best-effort resume of WebAudio context (for positional audio).
  const audioListener = resource?.audioListener;
  audioListener?.context?.resume?.().catch?.(() => {});

  let desiredVolume = resolveDesiredVolume(cfg, video, resource);
  if (desiredVolume <= 0 && !(cfg && typeof cfg.volume === 'number')) {
    desiredVolume = DEFAULT_VOLUME;
  }
  const userMuted = typeof resource?.userMuted === 'boolean' ? resource.userMuted : cfg?.muted === true;

  // Spatial mode: when user unmutes, keep positional channel active and ensure
  // media element itself is not muted so MediaElementSource remains audible.
  if (resource?.positionalAudio) {
    if (userMuted) {
      video.muted = true;
      video.setAttribute('muted', '');
      resource.positionalAudio.setVolume(0);
    } else {
      video.muted = false;
      video.removeAttribute('muted');
      video.volume = desiredVolume;
      resource.positionalAudio.setVolume(desiredVolume);
    }
    if (videoId) setVideoResource(videoId, { userMuted, userVolume: desiredVolume });
    return true;
  }

  // Fallback path when no positional audio is present.
  if (userMuted) {
    video.muted = true;
    video.setAttribute('muted', '');
    if (videoId) setVideoResource(videoId, { userMuted: true, userVolume: desiredVolume });
    return true;
  }

  video.muted = false;
  video.removeAttribute('muted');
  if (videoId) setVideoResource(videoId, { userMuted: false, userVolume: desiredVolume });
  video.volume = desiredVolume;
  return true;
}

export function resumeVideoAudioById(videoId) {
  if (!videoId) return false;
  setVideoResource(videoId, { userMuted: false });
  const resource = getVideoResource(videoId);
  if (resource?.video instanceof HTMLVideoElement) {
    loadVideoSource(resource.video, resource.cfg);
  }
  return resumeVideoAudio(resource);
}

export function invokeVideoControlById(videoId, action, value) {
  if (!_videoScenePlaybackEnabled) return false;
  if (!videoId || !action) return false;
  const resource = getVideoResource(videoId);
  const video = resource?.video;
  if (!(video instanceof HTMLVideoElement)) return false;

  if (action === 'play_pause') {
    if (video.paused || video.ended) {
      setVideoResource(videoId, { userMuted: false });
      loadVideoSource(video, getVideoResource(videoId)?.cfg);
      resumeVideoAudio(getVideoResource(videoId));
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    return true;
  }

  if (action === 'mute_toggle') {
    const muted = typeof resource?.userMuted === 'boolean' ? resource.userMuted : !!video.muted;
    setVideoResource(videoId, { userMuted: !muted });
    resumeVideoAudio(getVideoResource(videoId));
    return true;
  }

  if (action === 'volume_up' || action === 'volume_down') {
    const base =
      typeof resource?.userVolume === 'number' && Number.isFinite(resource.userVolume)
        ? resource.userVolume
        : Math.min(Math.max(video.volume ?? DEFAULT_VOLUME, 0), 1);
    const delta = action === 'volume_up' ? 0.1 : -0.1;
    const nextVolume = Math.min(1, Math.max(0, base + delta));
    setVideoResource(videoId, { userMuted: false, userVolume: nextVolume });
    resumeVideoAudio(getVideoResource(videoId));
    return true;
  }

  if (action === 'fullscreen_toggle') {
    return openVideoPlayerById(videoId);
  }

  if (action === 'seek_to') {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (duration <= 0) return false;
    const ratio = typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    try {
      video.currentTime = ratio * duration;
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function resumeAllVideoAudio() {
  let resumed = 0;
  _videoResourceCache.forEach((resource) => {
    if (resumeVideoAudio(resource)) resumed++;
  });
  return resumed;
}


// Ensure a <video> element exists and is configured
function ensureVideoElement(cfg) {
  if (!cfg || !cfg.id) return null;
  const mode = resolveVideoPlaybackMode(cfg);
  let video = document.getElementById(cfg.id);
  const resource = getVideoResource(cfg.id);
  if (video) {
    video.loop = cfg.loop ?? true;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = cfg.preload || 'metadata';
    const initialMuted = mode === 'synced_silent' || cfg.disableAudio === true || cfg.muted === true;
    const muted = typeof resource?.userMuted === 'boolean' ? resource.userMuted : initialMuted;
    const desiredVolume =
      typeof resource?.userVolume === 'number' && Number.isFinite(resource.userVolume)
        ? Math.min(Math.max(resource.userVolume, 0), 1)
        : typeof cfg.volume === 'number' && Number.isFinite(cfg.volume)
          ? Math.min(Math.max(cfg.volume, 0), 1)
          : DEFAULT_VOLUME;
    video.muted = muted;
    if (muted) {
      video.setAttribute('muted', '');
    } else {
      video.removeAttribute('muted');
    }
    video.volume = desiredVolume;
    const resolvedPoster = resolvePosterUrl(cfg);
    if (resolvedPoster && video.poster !== resolvedPoster) {
      video.poster = resolvedPoster;
    }
    if (!shouldDeferVideoLoad(cfg)) {
      loadVideoSource(video, cfg);
    }
    return video;
  }

  video = document.createElement('video');


  video.id = cfg.id;
  video.loop = cfg.loop ?? true;
  setVideoResource(cfg.id, { video });


  // Disable autoplay and avoid forcing muted
  video.autoplay = false;
  const initialMuted = mode === 'synced_silent' || cfg.disableAudio === true || cfg.muted === true;
  const muted = typeof resource?.userMuted === 'boolean' ? resource.userMuted : initialMuted;
  video.muted = muted;
  if (muted) {
    video.setAttribute('muted', '');
  } else {
    video.removeAttribute('muted');
  }
  video.playsInline = true;
  video.preload = cfg.preload || 'metadata';
  video.crossOrigin = 'anonymous';
  const desiredVolume =
    typeof resource?.userVolume === 'number' && Number.isFinite(resource.userVolume)
      ? Math.min(Math.max(resource.userVolume, 0), 1)
      : typeof cfg.volume === 'number' && Number.isFinite(cfg.volume)
        ? Math.min(Math.max(cfg.volume, 0), 1)
        : DEFAULT_VOLUME;
  video.volume = desiredVolume;

  const resolvedPoster = resolvePosterUrl(cfg);
  if (resolvedPoster) {
    video.poster = resolvedPoster;
  }

  if (!shouldDeferVideoLoad(cfg)) {
    loadVideoSource(video, cfg);
  }
  document.body.appendChild(video);

  // Keep paused on ready; emit a custom event consumers can listen for
  video.addEventListener('canplaythrough', () => {
    if (cfg.autoplayOnEnter !== true) {
      video.pause();
      video.currentTime = video.currentTime;
    }
    video.dispatchEvent(new Event('videoready'));
  }, { once: true });

  return video;
}

// Add a play/pause icon overlay to the mesh

function getWorldBounds(mesh) {
  const size = new Vector3();
  const center = new Vector3();
  if (!mesh.geometry) return { size, center };

  if (!mesh.geometry.boundingBox) {
    mesh.geometry.computeBoundingBox?.();
  }

  mesh.geometry.boundingBox?.getSize(size);
  mesh.geometry.boundingBox?.getCenter(center);

  // Apply local scale
  size.multiply(mesh.scale);
  center.multiply(mesh.scale);

  return { size, center };
}

function resolveControlsAnchorNode(mesh, scene, cfg) {
  const configured =
    typeof cfg?.controlsAnchorName === 'string' && cfg.controlsAnchorName.trim()
      ? cfg.controlsAnchorName.trim()
      : null;
  const candidates = [
    configured,
    cfg?.id ? `VideoControlsAnchor_${cfg.id}` : null,
    cfg?.id ? `VideoControlsAnchor-${cfg.id}` : null,
    cfg?.id ? `VideoControlsAnchor.${cfg.id}` : null
  ].filter(Boolean);

  for (const name of candidates) {
    const fromMesh = mesh.getObjectByName(name);
    if (fromMesh) return fromMesh;
    const fromScene = scene?.getObjectByName?.(name);
    if (fromScene) return fromScene;
  }
  return null;
}

function addInWorldControlObject(mesh, cfg, scene) {
  if (cfg?.controls === false) return null;

  const anchor = resolveControlsAnchorNode(mesh, scene, cfg);
  const { size } = getWorldBounds(mesh);
  const desiredWidth = Math.max(0.36, Math.min(1.05, (size.x || 1) * 0.72));
  const desiredHeight = Math.max(0.06, desiredWidth * 0.16);
  const panelGeo = new PlaneGeometry(1, 1);
  const panelMat = new MeshBasicMaterial({
    color: 0x020617,
    transparent: true,
    opacity: 0.88,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const panel = new Mesh(panelGeo, panelMat);
  panel.name = `VideoControlRig_${cfg.id}`;
  panel.renderOrder = 998;
  panel.userData.__isVideoControlProxy = true;

  const playTexture = getImageIconTexture(PLAY_ICON_URL);
  const pauseTexture = getImageIconTexture(PAUSE_ICON_URL);
  const muteTexture = getGlyphIconTexture('mute');
  const unmuteTexture = getGlyphIconTexture('unmute');
  const fullscreenTexture = getGlyphIconTexture('fullscreen');
  const knobTexture = getGlyphIconTexture('dot');

  const addBar = (name, x, y, width, height, color, opacity, z = 0.001) => {
    const barGeo = new PlaneGeometry(width, height);
    const barMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const bar = new Mesh(barGeo, barMat);
    bar.name = `${name}_${cfg.id}`;
    bar.position.set(x, y, z);
    bar.renderOrder = 999;
    bar.userData.__isVideoControlProxy = true;
    panel.add(bar);
    return bar;
  };

  addBar('VideoControlInnerBg', 0, 0, 0.96, 0.82, 0x000814, 0.35);

  const addIconButton = (name, x, texture, action) => {
    const hitGeo = new PlaneGeometry(0.082, 0.56);
    const hitMat = new MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.001,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const button = new Mesh(hitGeo, hitMat);
    button.name = `VideoControlButton_${cfg.id}_${name}`;
    button.position.set(x, 0, 0.002);
    button.renderOrder = 999;
    button.userData.type = 'VideoControl';
    button.userData.elementID = cfg.id;
    button.userData.action = action;
    button.userData.__isVideoControlProxy = true;

    const iconGeo = new PlaneGeometry(0.048, 0.34);
    const iconMat = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.94,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const icon = new Mesh(iconGeo, iconMat);
    icon.position.set(0, 0, 0.001);
    icon.renderOrder = 1000;
    icon.userData.type = 'VideoControl';
    icon.userData.elementID = cfg.id;
    icon.userData.action = action;
    icon.userData.__isVideoControlProxy = true;
    button.add(icon);
    panel.add(button);

    return { button, icon, iconMat };
  };

  const playPause = addIconButton('playPause', -0.455, playTexture, 'play_pause');
  const mute = addIconButton('mute', 0.285, muteTexture, 'mute_toggle');
  addIconButton('fullscreen', 0.455, fullscreenTexture, 'fullscreen_toggle');

  const progressWidth = 0.38;
  const progressHeight = 0.065;
  const progressCenterX = -0.18;
  const progressY = 0;
  addBar('VideoControlProgressTrack', progressCenterX, progressY, progressWidth, progressHeight, 0x0f172a, 0.95, 0.0015);
  const progressFillMat = new MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 1,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const progressFill = new Mesh(new PlaneGeometry(1, progressHeight * 0.82), progressFillMat);
  progressFill.name = `VideoControlProgressFill_${cfg.id}`;
  progressFill.position.set(progressCenterX, progressY, 0.0018);
  progressFill.renderOrder = 999;
  progressFill.userData.__isVideoControlProxy = true;
  panel.add(progressFill);
  const progressKnobGeo = new PlaneGeometry(0.024, 0.24);
  const progressKnobMat = new MeshBasicMaterial({
    map: knobTexture,
    transparent: true,
    opacity: 0.98,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const progressKnob = new Mesh(progressKnobGeo, progressKnobMat);
  progressKnob.position.set(progressCenterX - progressWidth * 0.5, progressY, 0.002);
  progressKnob.renderOrder = 1000;
  progressKnob.userData.__isVideoControlProxy = true;
  panel.add(progressKnob);

  const progressHitZoneGeo = new PlaneGeometry(progressWidth, 0.26);
  const progressHitZoneMat = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.001,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const progressHitZone = new Mesh(progressHitZoneGeo, progressHitZoneMat);
  progressHitZone.name = `VideoControlButton_${cfg.id}_seek`;
  progressHitZone.position.set(progressCenterX, progressY, 0.0022);
  progressHitZone.renderOrder = 1001;
  progressHitZone.userData.type = 'VideoControl';
  progressHitZone.userData.elementID = cfg.id;
  progressHitZone.userData.action = 'seek_to';
  progressHitZone.userData.seekMinX = -progressWidth * 0.5;
  progressHitZone.userData.seekMaxX = progressWidth * 0.5;
  progressHitZone.userData.__isVideoControlProxy = true;
  panel.add(progressHitZone);

  const volumeWidth = 0.14;
  const volumeHeight = 0.065;
  const volumeCenterX = 0.37;
  addBar('VideoControlVolumeTrack', volumeCenterX, 0, volumeWidth, volumeHeight, 0x334155, 0.9, 0.0015);
  const volumeFillMat = new MeshBasicMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.96,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const volumeFill = new Mesh(new PlaneGeometry(1, volumeHeight * 0.72), volumeFillMat);
  volumeFill.name = `VideoControlVolumeFill_${cfg.id}`;
  volumeFill.position.set(volumeCenterX, 0, 0.0018);
  volumeFill.renderOrder = 999;
  volumeFill.userData.__isVideoControlProxy = true;
  panel.add(volumeFill);
  const volumeKnobGeo = new PlaneGeometry(0.02, 0.2);
  const volumeKnobMat = new MeshBasicMaterial({
    map: knobTexture,
    transparent: true,
    opacity: 0.96,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const volumeKnob = new Mesh(volumeKnobGeo, volumeKnobMat);
  volumeKnob.position.set(volumeCenterX - volumeWidth * 0.5, 0, 0.002);
  volumeKnob.renderOrder = 1000;
  volumeKnob.userData.__isVideoControlProxy = true;
  panel.add(volumeKnob);

  const addVolumeZone = (name, x, action) => {
    const zoneGeo = new PlaneGeometry(volumeWidth * 0.5, 0.32);
    const zoneMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.001,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const zone = new Mesh(zoneGeo, zoneMat);
    zone.name = `VideoControlButton_${cfg.id}_${name}`;
    zone.position.set(x, 0, 0.0022);
    zone.renderOrder = 1001;
    zone.userData.type = 'VideoControl';
    zone.userData.elementID = cfg.id;
    zone.userData.action = action;
    zone.userData.__isVideoControlProxy = true;
    panel.add(zone);
  };
  addVolumeZone('volDownZone', volumeCenterX - volumeWidth * 0.25, 'volume_down');
  addVolumeZone('volUpZone', volumeCenterX + volumeWidth * 0.25, 'volume_up');

  const timeCanvas = document.createElement('canvas');
  timeCanvas.width = 768;
  timeCanvas.height = 256;
  const timeCtx = timeCanvas.getContext('2d');
  const timeTexture = new CanvasTexture(timeCanvas);
  timeTexture.colorSpace = SRGBColorSpace;
  timeTexture.flipY = false;
  timeTexture.minFilter = LinearFilter;
  timeTexture.magFilter = LinearFilter;
  timeTexture.anisotropy = 8;
  timeTexture.generateMipmaps = false;
  timeTexture.needsUpdate = true;
  const timeMat = new MeshBasicMaterial({
    map: timeTexture,
    transparent: true,
    opacity: 0.98,
    toneMapped: false,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const timeMesh = new Mesh(new PlaneGeometry(0.17, 0.34), timeMat);
  timeMesh.position.set(0.09, 0, 0.0018);
  timeMesh.renderOrder = 1000;
  timeMesh.userData.__isVideoControlProxy = true;
  panel.add(timeMesh);

  const formatClock = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };
  let lastTimeLabel = '';
  const updateTimeLabel = (video) => {
    if (!timeCtx) return;
    const label = formatClock(video.currentTime);
    if (label === lastTimeLabel) return;
    lastTimeLabel = label;
    timeCtx.clearRect(0, 0, timeCanvas.width, timeCanvas.height);
    timeCtx.fillStyle = 'rgba(2, 6, 23, 0.78)';
    timeCtx.fillRect(0, 0, timeCanvas.width, timeCanvas.height);
    timeCtx.lineJoin = 'round';
    timeCtx.lineWidth = 18;
    timeCtx.strokeStyle = 'rgba(0, 0, 0, 0.98)';
    timeCtx.font = '800 154px "SF Mono", "Roboto Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    timeCtx.textAlign = 'center';
    timeCtx.textBaseline = 'middle';
    timeCtx.strokeText(label, timeCanvas.width / 2, timeCanvas.height / 2);
    timeCtx.fillStyle = '#ffffff';
    timeCtx.shadowColor = 'rgba(14, 165, 233, 0.55)';
    timeCtx.shadowBlur = 10;
    timeCtx.shadowOffsetX = 0;
    timeCtx.shadowOffsetY = 1;
    timeCtx.fillText(label, timeCanvas.width / 2, timeCanvas.height / 2);
    timeCtx.shadowColor = 'transparent';
    timeCtx.shadowBlur = 0;
    timeTexture.needsUpdate = true;
  };

  const updateButtonStates = () => {
    const resource = getVideoResource(cfg.id);
    const video = resource?.video;
    if (!(video instanceof HTMLVideoElement)) return;

    playPause.iconMat.map = video.paused || video.ended ? playTexture : pauseTexture;
    playPause.iconMat.needsUpdate = true;

    const isMuted = typeof resource?.userMuted === 'boolean' ? resource.userMuted : !!video.muted;
    mute.iconMat.map = isMuted ? muteTexture : unmuteTexture;
    mute.iconMat.needsUpdate = true;

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? Math.min(Math.max(video.currentTime, 0), duration || 0) : 0;
    const progressRatio = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;
    const progressFillWidth = Math.max(0.0001, progressWidth * progressRatio);
    progressFill.scale.x = progressFillWidth;
    progressFill.position.x = progressCenterX - progressWidth * 0.5 + progressFillWidth * 0.5;
    progressKnob.position.x = progressCenterX - progressWidth * 0.5 + progressWidth * progressRatio;

    const currentVolume =
      typeof resource?.userVolume === 'number' && Number.isFinite(resource.userVolume)
        ? Math.min(Math.max(resource.userVolume, 0), 1)
        : Math.min(Math.max(video.volume ?? DEFAULT_VOLUME, 0), 1);
    const volumeRatio = isMuted ? 0 : currentVolume;
    const volumeFillWidth = Math.max(0.0001, volumeWidth * volumeRatio);
    volumeFill.scale.x = volumeFillWidth;
    volumeFill.position.x = volumeCenterX - volumeWidth * 0.5 + volumeFillWidth * 0.5;
    volumeKnob.position.x = volumeCenterX - volumeWidth * 0.5 + volumeWidth * volumeRatio;
    updateTimeLabel(video);
  };

  const resource = getVideoResource(cfg.id);
  const video = resource?.video;
  const onState = () => updateButtonStates();
  if (video instanceof HTMLVideoElement) {
    video.addEventListener('play', onState);
    video.addEventListener('pause', onState);
    video.addEventListener('ended', onState);
    video.addEventListener('volumechange', onState);
    video.addEventListener('timeupdate', onState);
    video.addEventListener('loadedmetadata', onState);
    video.addEventListener('durationchange', onState);
  }
  updateButtonStates();

  if (anchor) {
    // Respect anchor scaling from DCC (Blender). Keep a small clamp for safety.
    const anchorScale = new Vector3();
    anchor.getWorldScale(anchorScale);
    const safeX = Math.min(10, Math.max(0.01, Math.abs(anchorScale.x)));
    const safeY = Math.min(10, Math.max(0.01, Math.abs(anchorScale.y)));
    panel.scale.set(desiredWidth, desiredHeight, 1);
    panel.position.set(0, 0, 0.015);
    // Apply clamped factor via local scale so artist edits to anchor scale are visible.
    panel.scale.multiply(new Vector3(safeX, safeY, 1));
    anchor.add(panel);
  } else {
    const { center, size } = getWorldBounds(mesh);
    panel.position.copy(center);
    panel.position.z += 0.03 * Math.max(size.x || 1, size.y || 1);
    panel.scale.set(desiredWidth, desiredHeight, 1);
    mesh.add(panel);
  }

  return () => {
    if (video instanceof HTMLVideoElement) {
      video.removeEventListener('play', onState);
      video.removeEventListener('pause', onState);
      video.removeEventListener('ended', onState);
      video.removeEventListener('volumechange', onState);
      video.removeEventListener('timeupdate', onState);
      video.removeEventListener('loadedmetadata', onState);
      video.removeEventListener('durationchange', onState);
    }
    timeTexture.dispose();
    panel.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      }
    });
    panel.parent?.remove(panel);
  };
}

function addPlayIcon(mesh, video, camera) {
  const loader = new TextureLoader();
  let disposed = false;
  let iconMesh = null;
  const cleanupFns = [];

  const teardown = () => {
    disposed = true;
    cleanupFns.forEach(fn => {
      try {
        fn();
      } catch {
        /* noop */
      }
    });
    cleanupFns.length = 0;
    if (iconMesh) {
      iconMesh.parent?.remove(iconMesh);
      iconMesh.geometry?.dispose?.();
      iconMesh.material?.dispose?.();
      iconMesh = null;
    }
  };

  loader.load(PLAY_ICON_PATH, iconTex => {
    if (disposed) {
      iconTex.dispose();
      return;
    }

    // ✅ use world size instead of raw geometry
    const { size: worldSize, center: worldCenter } = getWorldBounds(mesh);
    const baseSize = 0.3 * Math.min(worldSize.x || 0, worldSize.y || 0) || 0.1;

    const iconGeo = new PlaneGeometry(baseSize, baseSize);
    const iconMat = new MeshBasicMaterial({
      map: iconTex,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
      depthWrite: false,
      side: DoubleSide
    });

    iconMesh = new Mesh(iconGeo, iconMat);
    iconMesh.name = `playIcon_${video.id}`;
    iconMesh.renderOrder = 999;
    iconMesh.userData.__isVideoDecoration = true;

    if (worldCenter) iconMesh.position.copy(worldCenter);
    const eps = -0.03 * Math.max(worldSize.x || 1, worldSize.y || 1);
    iconMesh.position.z += eps;
    iconMesh.position.y += eps;
    iconMesh.position.x += eps;

    mesh.add(iconMesh);

    // Billboard to camera
    const qParent = new Quaternion();
    const qCam = new Quaternion();
    const qLocal = new Quaternion();
    iconMesh.onBeforeRender = (renderer, scene, cam) => {
      const activeCam = camera || cam;
      mesh.getWorldQuaternion(qParent);
      activeCam.getWorldQuaternion(qCam);
      qLocal.copy(qParent).invert().multiply(qCam);
      iconMesh.quaternion.copy(qLocal);
    };

    // Visibility handling
    let isReady = false;
    const updateIcon = () => {
      iconMesh.visible = isReady && (video.paused || video.ended);
    };
    iconMesh.visible = false;

    const handleReady = () => {
      isReady = true;
      updateIcon();
    };
    const readyHandler = () => {
      handleReady();
      video.removeEventListener('loadeddata', readyHandler);
      video.removeEventListener('canplaythrough', readyHandler);
    };
    video.addEventListener('loadeddata', readyHandler);
    video.addEventListener('canplaythrough', readyHandler);
    cleanupFns.push(() => {
      video.removeEventListener('loadeddata', readyHandler);
      video.removeEventListener('canplaythrough', readyHandler);
    });

    const handlePlay = () => {
      iconMesh.visible = false;
    };
    const handlePause = () => updateIcon();
    const handleEnded = () => updateIcon();
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    cleanupFns.push(() => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    });
  });

  return teardown;
}



/**
 * Replace the original 'Video' meshes' JPG textures with live video:
 * - Uses the existing mesh and geometry
 * - Clones or recreates a standard material
 * - Swaps in a VideoTexture
 * - Ensures depthTest/write for full visibility/
 */
export function applyVideoMeshes(scene, camera, galleryConfig) {
  const videoList = galleryConfig.videos || [];
  const configMap = new Map(videoList.map(cfg => [cfg.id, cfg]));
  const objectRegistry = galleryConfig.objectRegistry;
  const syncGroups = createSyncPlaybackGroups(videoList);
  const clamp01 = (value, fallback) => {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.min(1, Math.max(0, numeric));
  };
  const clampMinZero = (value, fallback) => {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.max(0, numeric);
  };

  const videoTargets = [];
  scene.traverse(obj => {
    if (!obj.isMesh) return;
    if (isInternalVideoObject(obj)) return;

    const runtimeData = resolveObjectRuntimeData(obj, objectRegistry);
    if (runtimeData?.type !== 'Video') return;
    videoTargets.push({ obj, runtimeData });
  });

  videoTargets.forEach(({ obj, runtimeData }) => {
    const videoId = runtimeData.ref || obj.userData.elementID || obj.userData.name || obj.name;
    const cfg = configMap.get(videoId);
    if (!cfg) {
      console.warn(`No video config for ID ${videoId}`);
      return;
    }
    const playbackMode = resolveVideoPlaybackMode(cfg);

    if (!obj.userData._videoCleanupAttached) {
      obj.userData._videoCleanupAttached = true;
      obj.addEventListener('removed', () => {
        cleanupMeshDecorations(obj);
        disposeVideoResource(cfg.id);
      });
    }

    cleanupMeshDecorations(obj);
    const video = ensureVideoElement(cfg);
    if (!video) return;
    setVideoResource(cfg.id, { cfg, playbackMode });

    const resolvedPoster = resolvePosterUrl(cfg);
    let { posterTexture, texture: cachedTexture } = getVideoResource(cfg.id);
    const baseMaterial = obj.material.clone();
    if (!posterTexture && resolvedPoster) {
      const loader = new TextureLoader();
      posterTexture = loader.load(resolvedPoster, tex => {
        tex.colorSpace = SRGBColorSpace;
        tex.flipY = false;
        baseMaterial.needsUpdate = true;
      });
      setVideoResource(cfg.id, { posterTexture });
    }

    // Prepare a video texture up front so we can swap immediately on play
    let videoTexture = cachedTexture;
    if (!videoTexture) {
      videoTexture = new VideoTexture(video);
      videoTexture.colorSpace = SRGBColorSpace;
      videoTexture.flipY = false;
      setVideoResource(cfg.id, { video, texture: videoTexture, posterTexture });
    }

    const meshDisposers = getMeshDisposers(obj);

    // Default to poster if available, otherwise show the first video frame
    if (posterTexture) {
      baseMaterial.map = posterTexture;
    } else if (videoTexture) {
      baseMaterial.map = videoTexture;
    }
    baseMaterial.needsUpdate = true;
    baseMaterial.transparent = false;
    baseMaterial.depthTest = true;
    baseMaterial.depthWrite = true;
    baseMaterial.side = DoubleSide;
    if (cfg.videoSurface && typeof cfg.videoSurface === 'object') {
      // Optional per-screen tuning to make emissive displays feel less glossy.
      baseMaterial.roughness = clamp01(cfg.videoSurface.roughness, baseMaterial.roughness ?? 0.8);
      baseMaterial.metalness = clamp01(cfg.videoSurface.metalness, baseMaterial.metalness ?? 0);
      baseMaterial.envMapIntensity = clampMinZero(cfg.videoSurface.envMapIntensity, baseMaterial.envMapIntensity ?? 1);
      if (cfg.videoSurface.projection === true) {
        baseMaterial.emissive = new Color(
          typeof cfg.videoSurface.emissiveColor === 'string' ? cfg.videoSurface.emissiveColor : '#fff6ea'
        );
        baseMaterial.emissiveIntensity = clampMinZero(cfg.videoSurface.emissiveIntensity, 0.14);
        baseMaterial.emissiveMap = baseMaterial.map || null;
      }
    }
    obj.material = baseMaterial;

    // HTML overlay controls are legacy. Default to 3D in-world controls only.
    // Set `htmlOverlayControls: true` on a video config entry to opt back in.
    const useHtmlOverlayControls = cfg?.htmlOverlayControls === true;
    const overlayCleanup =
      !useHtmlOverlayControls || playbackMode === 'synced_silent' || cfg.controls === false
        ? null
        : addHtmlOverlay(obj, video, camera, cfg, scene);
    const controlObjectCleanup =
      playbackMode === 'synced_silent' || cfg.controls === false
        ? null
        : addInWorldControlObject(obj, cfg, scene);

    // Positional audio is only for spatial_video mode.
    const audioCleanup =
      playbackMode !== 'spatial_video' || cfg.disableAudio === true
        ? null
        : attachPositionalAudio(obj, video, camera, cfg);
    const syncCleanup = queueSyncedPlayback(cfg, video, syncGroups);

    if (typeof overlayCleanup === 'function') {
      _overlayDisposers.add(overlayCleanup);
      meshDisposers.push(() => {
        overlayCleanup();
        _overlayDisposers.delete(overlayCleanup);
      });
    }
    if (typeof controlObjectCleanup === 'function') {
      meshDisposers.push(controlObjectCleanup);
    }
    if (typeof audioCleanup === 'function') {
      meshDisposers.push(audioCleanup);
    }
    if (typeof syncCleanup === 'function') {
      meshDisposers.push(syncCleanup);
    }

    let metadataHandled = false;
    const onLoadedMetadata = () => {
      if (metadataHandled) return;
      metadataHandled = true;
      let hasPlayed = false;

      const swapToVideo = () => {
        if (videoTexture) {
          baseMaterial.map = videoTexture;
          if (cfg.videoSurface?.projection === true) {
            baseMaterial.emissiveMap = videoTexture;
          }
          baseMaterial.needsUpdate = true;
        }
      };

      const swapToPoster = () => {
        if (!hasPlayed && posterTexture) {
          baseMaterial.map = posterTexture;
          if (cfg.videoSurface?.projection === true) {
            baseMaterial.emissiveMap = posterTexture;
          }
          baseMaterial.needsUpdate = true;
        }
      };

      // Keep paused until user interacts for interactive videos only.
      if (cfg.autoplayOnEnter !== true) {
        video.currentTime = 0.01;
        video.pause();
      }
      if (videoTexture) {
        videoTexture.needsUpdate = true;
      }

      // Swap to live video as soon as playback starts, otherwise show poster
      const handlePlay = () => {
        hasPlayed = true;
        swapToVideo();
      };
      const handlePlaying = () => {
        hasPlayed = true;
        swapToVideo();
      };
      const handleTimeUpdate = () => {
        if (video.paused || video.ended) return;
        if (!hasPlayed) {
          hasPlayed = true;
        }
        swapToVideo();
      };
      const handlePause = () => swapToPoster();
      const handleEnded = () => swapToPoster();

      video.addEventListener('play', handlePlay);
      video.addEventListener('playing', handlePlaying);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('pause', handlePause);
      video.addEventListener('ended', handleEnded);

      meshDisposers.push(() => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('ended', handleEnded);
      });

      // If playback is already active when metadata loads, ensure poster is replaced
      if (!video.paused && !video.ended) {
        hasPlayed = true;
        swapToVideo();
      }
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    meshDisposers.push(() => video.removeEventListener('loadedmetadata', onLoadedMetadata));
    if (video.readyState >= 1) {
      onLoadedMetadata();
    }

  });
}

function addHtmlOverlay(mesh, video, camera, cfg, scene) {
  if (typeof document === 'undefined') return null;
  const allowFullscreen = cfg?.allowFullscreen !== false;
  const allowAudio = cfg?.disableAudio !== true;
  const controlsAnchor = resolveControlsAnchorNode(mesh, scene, cfg);

  const container = document.createElement('div');
  container.className = 'video-mesh-overlay';
  const playButton = document.createElement('button');
  playButton.className = 'video-mesh-overlay__button video-mesh-overlay__button--play';
  playButton.setAttribute('aria-label', 'Play');
  const fullscreenButton = allowFullscreen ? document.createElement('button') : null;
  if (fullscreenButton) {
    fullscreenButton.className = 'video-mesh-overlay__button video-mesh-overlay__button--ghost video-mesh-overlay__button--icon';
    fullscreenButton.setAttribute('aria-label', 'Open fullscreen player');
    fullscreenButton.title = 'Fullscreen';
  }
  const progress = document.createElement('input');
  progress.className = 'video-mesh-overlay__progress';
  progress.type = 'range';
  progress.min = '0';
  progress.max = '0';
  progress.step = '0.1';
  progress.value = '0';
  progress.disabled = true;
  const volume = document.createElement('input');
  volume.className = 'video-mesh-overlay__volume';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.05';
  const initialVolume =
    typeof cfg?.volume === 'number'
      ? Math.min(Math.max(cfg.volume, 0), 1)
      : Math.min(Math.max(video.volume ?? DEFAULT_VOLUME, 0), 1);
  video.volume = initialVolume;
  volume.value = String(initialVolume);

  container.appendChild(playButton);
  container.appendChild(progress);
  container.appendChild(volume);
  if (fullscreenButton) {
    container.appendChild(fullscreenButton);
  }
  document.body.appendChild(container);

  const worldPos = new Vector3();
  const corners = Array.from({ length: 8 }, () => new Vector3());
  const cameraPos = new Vector3();
  const anchorWorld = new Vector3();
  const anchorWorldQuat = new Quaternion();
  const anchorForward = new Vector3();
  const anchorPlaced = new Vector3();
  const projectedAnchor = new Vector3();
  const rayTarget = new Vector3();
  const updatePosition = (renderer, activeCam) => {
    if (!_videoScenePlaybackEnabled) {
      container.style.display = 'none';
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();

    if (controlsAnchor) {
      controlsAnchor.getWorldPosition(anchorWorld);
      controlsAnchor.getWorldQuaternion(anchorWorldQuat);
      anchorForward.set(0, 0, 1).applyQuaternion(anchorWorldQuat).normalize();
      const { size } = getWorldBounds(mesh);
      const forwardOffset = 0.03 * Math.max(size.x || 1, size.y || 1);
      anchorPlaced.copy(anchorWorld).addScaledVector(anchorForward, forwardOffset);

      projectedAnchor.copy(anchorPlaced).project(activeCam);
      if (projectedAnchor.z < -1 || projectedAnchor.z > 1) {
        container.style.display = 'none';
        return;
      }

      if (scene && activeCam) {
        activeCam.getWorldPosition(cameraPos);
        if (cameraPos.distanceTo(anchorPlaced) > MAX_OVERLAY_DISTANCE) {
          container.style.display = 'none';
          return;
        }

        rayTarget.copy(anchorPlaced).sub(cameraPos).normalize();
        const raycaster = new Raycaster();
        raycaster.set(cameraPos, rayTarget);
        raycaster.far = cameraPos.distanceTo(anchorPlaced) + 0.1;
        const hits = raycaster.intersectObjects(scene.children, true);
        if (hits.length > 0) {
          const firstHit = hits[0].object;
          let current = firstHit;
          let belongsToMesh = false;
          while (current) {
            if (current === mesh) {
              belongsToMesh = true;
              break;
            }
            current = current.parent;
          }
          if (!belongsToMesh) {
            container.style.display = 'none';
            return;
          }
        }
      }

      const x = (projectedAnchor.x * 0.5 + 0.5) * rect.width + rect.left;
      const y = (-projectedAnchor.y * 0.5 + 0.5) * rect.height + rect.top;
      container.style.display = 'flex';
      container.style.left = `${x}px`;
      container.style.top = `${y}px`;
      return;
    }

    const geom = mesh.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox?.();
    if (!geom.boundingBox) {
      container.style.display = 'none';
      return;
    }

    const { min, max } = geom.boundingBox;
    const pts = [
      [min.x, min.y, min.z], [max.x, min.y, min.z], [min.x, max.y, min.z], [max.x, max.y, min.z],
      [min.x, min.y, max.z], [max.x, min.y, max.z], [min.x, max.y, max.z], [max.x, max.y, max.z]
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, behind = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, y, z] = pts[i];
      corners[i].set(x, y, z);
      mesh.localToWorld(corners[i]);
      corners[i].project(activeCam);
      if (corners[i].z < -1 || corners[i].z > 1) behind++;
      const sx = (corners[i].x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-corners[i].y * 0.5 + 0.5) * rect.height + rect.top;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }

    if (behind === pts.length) {
      container.style.display = 'none';
      return;
    }

    // Occlusion + distance checks
    if (scene && activeCam) {
      activeCam.getWorldPosition(cameraPos);
      const centerWorld = rayTarget.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
      mesh.localToWorld(centerWorld);

      // Too far? Hide
      if (cameraPos.distanceTo(centerWorld) > MAX_OVERLAY_DISTANCE) {
        container.style.display = 'none';
        return;
      }

      const raycaster = new Raycaster();
      raycaster.set(cameraPos, rayTarget.copy(centerWorld).sub(cameraPos).normalize());
      raycaster.far = cameraPos.distanceTo(centerWorld) + 0.1;
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length > 0) {
        const firstHit = hits[0].object;
        let current = firstHit;
        let belongsToMesh = false;
        while (current) {
          if (current === mesh) {
            belongsToMesh = true;
            break;
          }
          current = current.parent;
        }
        if (!belongsToMesh) {
          container.style.display = 'none';
          return;
        }
      }
    }

    container.style.display = 'flex';
    const x = (minX + maxX) / 2;
    const y = maxY + 16; // place just below the mesh
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
  };

  const handleBeforeRender = (renderer, scene, cam) => {
    const activeCam = camera || cam;
    updatePosition(renderer, activeCam);
  };

  const prevOnBeforeRender = mesh.onBeforeRender;
  mesh.onBeforeRender = (renderer, scene, cam) => {
    handleBeforeRender(renderer, scene, cam);
    if (typeof prevOnBeforeRender === 'function') {
      prevOnBeforeRender.call(mesh, renderer, scene, cam);
    }
  };

  const updateButton = () => {
    if (video.paused) {
      playButton.classList.add('video-mesh-overlay__button--play');
      playButton.classList.remove('video-mesh-overlay__button--pause');
      playButton.setAttribute('aria-label', 'Play');
    } else {
      playButton.classList.remove('video-mesh-overlay__button--play');
      playButton.classList.add('video-mesh-overlay__button--pause');
      playButton.setAttribute('aria-label', 'Pause');
    }
  };

  const updateProgress = () => {
    if (!Number.isFinite(video.duration) || video.duration === 0) {
      progress.disabled = true;
      progress.max = '0';
      progress.value = '0';
      return;
    }
    progress.disabled = false;
    progress.max = String(video.duration);
    progress.value = String(video.currentTime);
  };

  const handlePlayClick = (evt) => {
    evt.stopPropagation();
    if (!_videoScenePlaybackEnabled) return;
    if (allowAudio) {
      setVideoResource(cfg.id, { userMuted: false });
      const resource = getVideoResource(cfg.id);
      if (resource?.video instanceof HTMLVideoElement && resource.video.volume <= 0) {
        resource.video.volume = DEFAULT_VOLUME;
        setVideoResource(cfg.id, { userVolume: DEFAULT_VOLUME });
      }
      resumeVideoAudio(getVideoResource(cfg.id));
    }
    if (video.paused) {
      loadVideoSource(video, cfg);
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const handleProgressInput = (evt) => {
    evt.stopPropagation();
    if (!_videoScenePlaybackEnabled) return;
    const target = evt.target;
    const val = Number(target.value);
    if (Number.isFinite(val) && Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(Math.max(val, 0), video.duration);
    }
  };

  const updateVolume = () => {
    const vol = Math.min(Math.max(video.volume ?? DEFAULT_VOLUME, 0), 1);
    volume.value = String(vol);
  };

  const handleVolumeInput = (evt) => {
    evt.stopPropagation();
    if (!_videoScenePlaybackEnabled) return;
    const target = evt.target;
    const val = Number(target.value);
    if (Number.isFinite(val)) {
      if (allowAudio) {
        const clamped = Math.min(Math.max(val, 0), 1);
        video.volume = clamped;
        setVideoResource(cfg.id, { userMuted: false, userVolume: clamped });
        const resource = getVideoResource(cfg.id);
        resumeVideoAudio(resource);
        if (resource?.positionalAudio) {
          resource.positionalAudio.setVolume(clamped);
        }
      }
    }
  };

  playButton.addEventListener('click', handlePlayClick);
  progress.addEventListener('input', handleProgressInput);
  volume.addEventListener('input', handleVolumeInput);
  const handleFullscreenClick = (evt) => {
    evt.stopPropagation();
    if (!_videoScenePlaybackEnabled) return;
    if (allowFullscreen) {
      openVideoPlayer(cfg, video);
    }
  };
  if (fullscreenButton) {
    fullscreenButton.addEventListener('click', handleFullscreenClick);
  }

  const eventHandlers = [
    ['play', updateButton],
    ['pause', updateButton],
    ['timeupdate', updateProgress],
    ['loadedmetadata', updateProgress],
    ['ended', updateButton],
    ['volumechange', updateVolume]
  ];
  eventHandlers.forEach(([evt, handler]) => video.addEventListener(evt, handler));

  updateButton();
  updateProgress();
  updateVolume();

  return () => {
    eventHandlers.forEach(([evt, handler]) => video.removeEventListener(evt, handler));
    playButton.removeEventListener('click', handlePlayClick);
    progress.removeEventListener('input', handleProgressInput);
    volume.removeEventListener('input', handleVolumeInput);
    if (fullscreenButton) {
      fullscreenButton.removeEventListener('click', handleFullscreenClick);
    }
    mesh.onBeforeRender = prevOnBeforeRender || null;
    if (container.parentNode) container.parentNode.removeChild(container);
  };
}
