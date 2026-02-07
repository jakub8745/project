import {
  VideoTexture,
  TextureLoader,
  MeshBasicMaterial,
  DoubleSide,
  SRGBColorSpace,
  PlaneGeometry,
  RingGeometry,
  Vector3,
  Quaternion,
  Mesh,
  Raycaster,
  PositionalAudio,
  AudioListener
} from 'three';

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

// --- Step 1: resource cache ---
const _videoResourceCache = new Map(); // id -> { video, texture }

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

function openVideoPlayer(cfg, video) {
  if (typeof document === 'undefined' || !(video instanceof HTMLVideoElement)) return false;

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
      video.muted = false;
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
  if (!videoId) return false;
  const resource = getVideoResource(videoId);
  const video = resource?.video;
  if (!(video instanceof HTMLVideoElement)) return false;
  const cfg = resource?.cfg || { id: videoId };
  return openVideoPlayer(cfg, video);
}

export function disposeAllVideoMeshes() {
  _overlayDisposers.forEach((dispose) => {
    try {
      dispose();
    } catch {
      /* ignore */
    }
  });
  _overlayDisposers.clear();
  Array.from(_videoResourceCache.keys()).forEach((id) => disposeVideoResource(id));
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
    video.muted = true; // avoid duplicate output; spatial audio handles playback
  } catch (err) {
    console.warn('Failed to attach positional audio', err);
    return null;
  }

  // Center of mesh bounds
  const { center } = getWorldBounds(mesh);
  positionalAudio.position.copy(center);
  mesh.add(positionalAudio);

  setVideoResource(cfg.id, { ...existing, positionalAudio, audioSourceNode: positionalAudio.source, audioListener: listener });

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


// Ensure a <video> element exists and is configured
function ensureVideoElement(cfg) {
  if (!cfg || !cfg.id) return null;
  let video = document.getElementById(cfg.id);
  if (video) {
    const resolvedPoster = resolvePosterUrl(cfg);
    if (resolvedPoster && video.poster !== resolvedPoster) {
      video.poster = resolvedPoster;
    }
    return video;
  }

  video = document.createElement('video');


  video.id = cfg.id;
  video.loop = cfg.loop ?? true;
  setVideoResource(cfg.id, { video });


  // Disable autoplay and avoid forcing muted
  video.autoplay = false;
  video.muted = cfg.muted ?? false;
  video.removeAttribute('muted');
  video.playsInline = true;
  video.preload = cfg.preload || 'metadata';
  video.crossOrigin = 'anonymous';
  const desiredVolume =
    typeof cfg.volume === 'number'
      ? Math.min(Math.max(cfg.volume, 0), 1)
      : DEFAULT_VOLUME;
  video.volume = desiredVolume;

  const resolvedPoster = resolvePosterUrl(cfg);
  if (resolvedPoster) {
    video.poster = resolvedPoster;
  }

  // Oracle-first with IPFS fallback support
  const ipfsGateways = IPFS_GATEWAYS;

  const srcObj = cfg.sources[0]; // assume single video per cfg
  const primary = srcObj?.src || ""; // may be Oracle http(s) or ipfs://
  const ipfsUrl = srcObj?.ipfsSrc || (primary.startsWith("ipfs://") ? primary : null);

  let gwIndex = 0;
  const loadIpfs = () => {
    if (!ipfsUrl) {
      console.error(`[VideoMesh] Primary failed and no IPFS fallback: ${primary}`);
      return;
    }
    if (gwIndex >= ipfsGateways.length) {
      console.error(`[VideoMesh] Failed to load video from all gateways: ${ipfsUrl}`);
      return;
    }
    const cid = ipfsUrl.replace("ipfs://", "");
    const src = ipfsGateways[gwIndex] + cid;
    gwIndex++;
    video.src = src;
    video.type = srcObj.type;
    video.load();
    video.onerror = () => {
      console.warn(`[VideoMesh] Retrying IPFS gateway ${gwIndex}/${ipfsGateways.length}`);
      setTimeout(loadIpfs, 200);
    };
  };

  const loadPrimary = () => {
    // If primary is ipfs://, go straight to IPFS flow
    if (typeof primary === 'string' && primary.startsWith('ipfs://')) {
      loadIpfs();
      return;
    }
    if (!primary) {
      loadIpfs();
      return;
    }
    video.src = primary;
    video.type = srcObj.type;
    video.load();
    video.onerror = () => {
      console.warn(`[VideoMesh] Primary source failed, falling back to IPFS: ${primary}`);
      loadIpfs();
    };
  };

  loadPrimary();
  document.body.appendChild(video);

  // Keep paused on ready; emit a custom event consumers can listen for
  video.addEventListener('canplaythrough', () => {
    video.pause();
    video.currentTime = video.currentTime;
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
  const configMap = new Map((galleryConfig.videos || []).map(cfg => [cfg.id, cfg]));

  scene.traverse(obj => {
    if (!obj.isMesh || obj.userData.type !== 'Video') return;

    const cfg = configMap.get(obj.userData.elementID);
    if (!cfg) {
      console.warn(`No video config for ID ${obj.userData.elementID}`);
      return;
    }

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
    setVideoResource(cfg.id, { cfg });

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
    obj.material = baseMaterial;

    const meshDisposers = getMeshDisposers(obj);

    // Spinner appears while loading/buffering
    const spinnerCleanup = addLoadingSpinner(obj, video, camera);

    // HTML overlay (play/pause + progress)
    const overlayCleanup = addHtmlOverlay(obj, video, camera, cfg, scene);

    // Positional audio anchored to the video mesh
    const audioCleanup = attachPositionalAudio(obj, video, camera, cfg);

    if (typeof spinnerCleanup === 'function') {
      meshDisposers.push(spinnerCleanup);
    }
    if (typeof overlayCleanup === 'function') {
      _overlayDisposers.add(overlayCleanup);
      meshDisposers.push(() => {
        overlayCleanup();
        _overlayDisposers.delete(overlayCleanup);
      });
    }
    if (typeof audioCleanup === 'function') {
      meshDisposers.push(audioCleanup);
    }

    let metadataHandled = false;
    const onLoadedMetadata = () => {
      if (metadataHandled) return;
      metadataHandled = true;
      let hasPlayed = false;

      const swapToVideo = () => {
        if (videoTexture) {
          baseMaterial.map = videoTexture;
          baseMaterial.needsUpdate = true;
        }
      };

      const swapToPoster = () => {
        if (!hasPlayed && posterTexture) {
          baseMaterial.map = posterTexture;
          baseMaterial.needsUpdate = true;
        }
      };

      // Keep paused until user interacts
      video.currentTime = 0.01;
      video.pause();
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

function addLoadingSpinner(mesh, video, camera) {
  const { size: worldSize, center: worldCenter } = getWorldBounds(mesh);
  const baseSize = 0.15 * Math.min(worldSize.x || 0, worldSize.y || 0) || 0.1;

  const spinnerGeo = new RingGeometry(baseSize * 0.7, baseSize, 32, 1, 0, Math.PI * 1.5);
  const spinnerMat = new MeshBasicMaterial({
    color: 0x87ceeb, // sky-blue
    transparent: true,
    opacity: 0.9,
    side: DoubleSide
  });
  const spinnerMesh = new Mesh(spinnerGeo, spinnerMat);
  spinnerMesh.name = `spinner_${video.id}`;

  const pivot = new Mesh();
  pivot.name = `spinnerPivot_${video.id}`;
  pivot.renderOrder = 999;

  if (worldCenter) pivot.position.copy(worldCenter);
  const eps = -0.03 * Math.max(worldSize.x || 1, worldSize.y || 1);
  pivot.position.addScalar(eps);

  pivot.add(spinnerMesh);
  mesh.add(pivot);

  // Billboard
  const qParent = new Quaternion();
  const qCam = new Quaternion();
  const qLocal = new Quaternion();
  pivot.onBeforeRender = (renderer, scene, cam) => {
    const activeCam = camera || cam;
    mesh.getWorldQuaternion(qParent);
    activeCam.getWorldQuaternion(qCam);
    qLocal.copy(qParent).invert().multiply(qCam);
    pivot.quaternion.copy(qLocal);
  };

  // Spin clockwise
  let rafId = 0;
  let active = true;
  const animate = () => {
    if (!active) return;
    if (spinnerMesh.visible) spinnerMesh.rotation.z -= 0.1;
    rafId = requestAnimationFrame(animate);
  };
  rafId = requestAnimationFrame(animate);

  // Visibility rules
  const hide = () => (spinnerMesh.visible = false);
  const showIfPlaying = () => (spinnerMesh.visible = !video.paused && !video.ended);

  const hideEvents = ["loadeddata", "canplaythrough", "playing", "ended", "error"];
  hideEvents.forEach(evt => video.addEventListener(evt, hide));

  // Show when buffering while playing
  const showEvents = ["waiting", "stalled", "seeking"];
  showEvents.forEach(evt => video.addEventListener(evt, showIfPlaying));

  // Start visible
  spinnerMesh.visible = true;

  return () => {
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    hideEvents.forEach(evt => video.removeEventListener(evt, hide));
    showEvents.forEach(evt => video.removeEventListener(evt, showIfPlaying));
    pivot.parent?.remove(pivot);
    spinnerMesh.geometry?.dispose?.();
    spinnerMesh.material?.dispose?.();
  };
}

function addHtmlOverlay(mesh, video, camera, cfg, scene) {
  if (typeof document === 'undefined') return null;

  const container = document.createElement('div');
  container.className = 'video-mesh-overlay';
  const playButton = document.createElement('button');
  playButton.className = 'video-mesh-overlay__button video-mesh-overlay__button--play';
  playButton.setAttribute('aria-label', 'Play');
  const fullscreenButton = document.createElement('button');
  fullscreenButton.className = 'video-mesh-overlay__button video-mesh-overlay__button--ghost video-mesh-overlay__button--icon';
  fullscreenButton.setAttribute('aria-label', 'Open fullscreen player');
  fullscreenButton.title = 'Fullscreen';
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
  container.appendChild(fullscreenButton);
  document.body.appendChild(container);

  const worldPos = new Vector3();
  const corners = Array.from({ length: 8 }, () => new Vector3());
  const updatePosition = (renderer, activeCam) => {
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
    const rect = renderer.domElement.getBoundingClientRect();

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
      const cameraPos = activeCam.getWorldPosition(new Vector3());
      const centerWorld = new Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
      mesh.localToWorld(centerWorld);

      // Too far? Hide
      if (cameraPos.distanceTo(centerWorld) > MAX_OVERLAY_DISTANCE) {
        container.style.display = 'none';
        return;
      }

      const raycaster = new Raycaster();
      raycaster.set(cameraPos, centerWorld.clone().sub(cameraPos).normalize());
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
    const audioListener = getVideoResource(cfg.id)?.audioListener;
    audioListener?.context?.resume?.().catch?.(() => {});
    video.muted = false;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const handleProgressInput = (evt) => {
    evt.stopPropagation();
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
    const target = evt.target;
    const val = Number(target.value);
    if (Number.isFinite(val)) {
      video.muted = false;
      video.volume = Math.min(Math.max(val, 0), 1);
      const audioListener = getVideoResource(cfg.id)?.audioListener;
      audioListener?.context?.resume?.().catch?.(() => {});
    }
  };

  playButton.addEventListener('click', handlePlayClick);
  progress.addEventListener('input', handleProgressInput);
  volume.addEventListener('input', handleVolumeInput);
  const handleFullscreenClick = (evt) => {
    evt.stopPropagation();
    openVideoPlayer(cfg, video);
  };
  fullscreenButton.addEventListener('click', handleFullscreenClick);

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
    fullscreenButton.removeEventListener('click', handleFullscreenClick);
    mesh.onBeforeRender = prevOnBeforeRender || null;
    if (container.parentNode) container.parentNode.removeChild(container);
  };
}
