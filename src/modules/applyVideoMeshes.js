import {
  VideoTexture,
  TextureLoader,
  MeshBasicMaterial,
  DoubleSide,
  SRGBColorSpace,
  PlaneGeometry,
  RingGeometry,
  Box3,
  Vector3,
  Quaternion,
  //Vector3,
  Mesh
} from 'three';

const PLAY_ICON_PATH =
  'https://bafybeieawhqdesjes54to4u6gmqwzvpzlp2o5ncumaqw3nfiv2mui6i6q4.ipfs.w3s.link/ButtonPlay.png';

// Ensure a <video> element exists and is configured
function ensureVideoElement(cfg) {
  if (!cfg || !cfg.id) return null;
  let video = document.getElementById(cfg.id);
  if (video) return video;

  video = document.createElement('video');
  video.id = cfg.id;
  video.loop = cfg.loop ?? true;

  // ✅ Force muted autoplay
  video.muted = true;
  video.setAttribute('muted', ''); // Safari fix
  video.playsInline = true;
  video.preload = cfg.preload || 'auto';
  video.crossOrigin = 'anonymous';

  const ipfsGateways = [
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://dweb.link/ipfs/"
  ];

  function ipfsToHttpMulti(ipfsUrl, gatewayIndex = 0) {
    const cid = ipfsUrl.replace("ipfs://", "");
    return ipfsGateways[gatewayIndex] + cid;
  }

  let attempts = 0;
  const trySource = () => {
    const srcObj = cfg.sources[0]; // assume single video per cfg
    const src = srcObj.src.startsWith("ipfs://")
      ? ipfsToHttpMulti(srcObj.src, attempts)
      : srcObj.src;

    video.src = src;
    video.type = srcObj.type;
    video.load();

    video.onerror = () => {
      attempts++;
      if (srcObj.src.startsWith("ipfs://") && attempts < ipfsGateways.length) {
        console.warn(`[VideoMesh] Retrying video load from another gateway: ${attempts}`);
        setTimeout(trySource, 200);
      } else {
        console.error(`[VideoMesh] Failed to load video from all gateways: ${srcObj.src}`);
      }
    };
  };

  trySource();
  document.body.appendChild(video);

  // ✅ Wait until ready before trying to play
  video.addEventListener("canplaythrough", () => {
    video.play().catch(err => {
      console.warn(`[VideoMesh] Autoplay blocked for ${cfg.id}`, err);

      // ✅ Fallback: user interaction
      const resume = () => {
        video.play().catch(e => console.error(`[VideoMesh] Manual play failed`, e));
        document.removeEventListener("click", resume);
        document.removeEventListener("touchstart", resume);
      };
      document.addEventListener("click", resume, { once: true });
      document.addEventListener("touchstart", resume, { once: true });
    });
  }, { once: true });

  return video;
}

// Add a play/pause icon overlay to the mesh

function getLocalBounds(mesh) {
  const size = new Vector3();
  const center = new Vector3();
  if (!mesh.geometry) return { size, center };
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox?.();
  mesh.geometry.boundingBox?.getSize(size);
  mesh.geometry.boundingBox?.getCenter(center);
  return { size, center };
}

function addPlayIcon(mesh, video, camera) {
  const loader = new TextureLoader();
  loader.load(PLAY_ICON_PATH, iconTex => {
    const { size: localSize, center: localCenter } = getLocalBounds(mesh);
    const baseLocal = Math.max(0.001, 0.3 * Math.min(localSize.x || 0, localSize.y || 0) || 1.0);

    const iconGeo = new PlaneGeometry(baseLocal, baseLocal);
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

    if (localCenter) iconMesh.position.copy(localCenter);
    const eps = -0.09 * Math.max(localSize.x || 1, localSize.y || 1);
    iconMesh.position.z += eps;

    mesh.add(iconMesh);

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

    video.addEventListener('play', () => (iconMesh.visible = false));
    video.addEventListener('pause', () => (iconMesh.visible = true));
    video.addEventListener('ended', () => (iconMesh.visible = true));
    iconMesh.visible = video.paused;
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

    obj.wireframe = false;

    const cfg = configMap.get(obj.userData.elementID);

    if (!cfg) {
      console.warn(`No video config for ID ${obj.userData.elementID}`);
      return;
    }

    const video = ensureVideoElement(cfg);
    if (!video) return;

    addLoadingSpinner(obj, video); // ✅ spinner before load


    video.addEventListener('loadedmetadata', () => {

      // Create VideoTexture
      const texture = new VideoTexture(video);
      texture.colorSpace = SRGBColorSpace;

      texture.flipY = false;


      const newMat = obj.material.clone();

      newMat.map = texture;
      newMat.transparent = false;
      newMat.depthTest = true;
      newMat.depthWrite = true;
      newMat.side = DoubleSide;

      newMat.needsUpdate = true;

      obj.material = newMat;

      addPlayIcon(obj, video, camera);

      video.currentTime = 0.01
      video.pause();

      texture.needsUpdate = true;


    });
  });
}


function addLoadingSpinner(mesh, video) {
  const spinnerGeo = new RingGeometry(0.2, 0.25, 32, 1, 0, Math.PI * 1.5);
  const spinnerMat = new MeshBasicMaterial({
    color: 0x87ceeb, // ✅ sky-blue
    transparent: true,
    opacity: 0.9,
    side: DoubleSide
  });
  const spinnerMesh = new Mesh(spinnerGeo, spinnerMat);
  spinnerMesh.name = `spinner_${video.id}`;
  spinnerMesh.position.set(0, 0, -0.02);
  mesh.add(spinnerMesh);

  // ✅ Spin clockwise
  const animate = () => {
    if (spinnerMesh.visible) {
      spinnerMesh.rotation.z += 0.1; // clockwise
      requestAnimationFrame(animate);
    }
  };
  animate();

  // hide spinner when video starts
  video.addEventListener("playing", () => (spinnerMesh.visible = false));
  video.addEventListener("canplay", () => (spinnerMesh.visible = false));
}




