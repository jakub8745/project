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
  Mesh
} from 'three';

const PLAY_ICON_PATH =
  'https://bafybeieawhqdesjes54to4u6gmqwzvpzlp2o5ncumaqw3nfiv2mui6i6q4.ipfs.w3s.link/ButtonPlay.png';


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
  // we keep the <video> element around for reuse (cheap); if you want to remove it later, do it explicitly
  _videoResourceCache.delete(id);
}


// Ensure a <video> element exists and is configured
function ensureVideoElement(cfg) {
  if (!cfg || !cfg.id) return null;
  let video = document.getElementById(cfg.id);
  if (video) return video;

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

  // Oracle-first with IPFS fallback support
  const ipfsGateways = [
    "https://cloudflare-ipfs.com/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://dweb.link/ipfs/"
  ];

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
  loader.load(PLAY_ICON_PATH, iconTex => {
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

    const iconMesh = new Mesh(iconGeo, iconMat);
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
    const qCam = new Quaternion();//
    const qLocal = new Quaternion();
    iconMesh.onBeforeRender = (renderer, scene, cam) => {
      const activeCam = camera || cam;
      mesh.getWorldQuaternion(qParent);
      activeCam.getWorldQuaternion(qCam);
      qLocal.copy(qParent).invert().multiply(qCam);
      iconMesh.quaternion.copy(qLocal);
    };

    // Visibility strategy:
    // - While loading: spinner shows, play icon hidden
    // - When first frame ready: hide spinner (handled elsewhere) and show play icon (if paused)
    // - When playing: hide play icon
    // - When paused/ended after ready: show play icon
    let isReady = false;

    const updateIcon = () => {
      iconMesh.visible = isReady && (video.paused || video.ended);
    };

    // Initial state: hidden until ready
    iconMesh.visible = false;

    // Ready events
    const onReady = () => {
      isReady = true;
      updateIcon();
    };
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('canplaythrough', onReady, { once: true });

    // Playback state
    video.addEventListener('play', () => {
      iconMesh.visible = false;
    });
    video.addEventListener('pause', updateIcon);
    video.addEventListener('ended', updateIcon);
  });
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
      obj.addEventListener('removed', () => disposeVideoResource(cfg.id));
    }


    const video = ensureVideoElement(cfg);
    if (!video) return;

    // Spinner appears while loading/buffering
    addLoadingSpinner(obj, video, camera);

    // Play icon exists even before metadata is ready
    addPlayIcon(obj, video, camera);

    video.addEventListener('loadedmetadata', () => {
      // Reuse cached texture if present
      let { texture } = getVideoResource(cfg.id);
      if (!texture) {
        texture = new VideoTexture(video);
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false;
        setVideoResource(cfg.id, { video, texture });
      }

      // Swap material map (don’t dispose the old JPG map here in case it’s shared elsewhere)
      const newMat = obj.material.clone();
      newMat.map = texture;
      newMat.transparent = false;
      newMat.depthTest = true;
      newMat.depthWrite = true;
      newMat.side = DoubleSide;
      newMat.needsUpdate = true;

      obj.material = newMat;

      // Keep paused until user interacts
      video.currentTime = 0.01;
      video.pause();
      texture.needsUpdate = true;
    });

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
  function animate() {
    if (spinnerMesh.visible) spinnerMesh.rotation.z -= 0.1;
    requestAnimationFrame(animate);
  }
  animate();

  // Visibility rules
  const hide = () => (spinnerMesh.visible = false);
  const showIfPlaying = () => (spinnerMesh.visible = !video.paused && !video.ended);

  // Hide when first frame ready
  video.addEventListener("loadeddata", hide);
  video.addEventListener("canplaythrough", hide);
  video.addEventListener("playing", hide);
  video.addEventListener("ended", hide);
  video.addEventListener("error", hide);

  // Show when buffering while playing
  video.addEventListener("waiting", showIfPlaying);
  video.addEventListener("stalled", showIfPlaying);
  video.addEventListener("seeking", showIfPlaying);

  // Start visible
  spinnerMesh.visible = true;
}



