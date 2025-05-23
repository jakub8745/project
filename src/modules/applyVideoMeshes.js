import {
  VideoTexture,
  MeshBasicMaterial,
  DoubleSide,
  SRGBColorSpace,
  TextureLoader,
  Mesh,
  Vector3,
  Quaternion,
  PlaneGeometry
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
  video.muted = cfg.muted ?? true;
  video.playsInline = cfg.playsInline ?? true;
  video.preload = cfg.preload || 'auto';
  video.crossOrigin = 'anonymous';

  cfg.sources.forEach(srcObj => {
    const source = document.createElement('source');
    source.src = srcObj.src.startsWith('ipfs://')
      ? srcObj.src.replace('ipfs://', 'https://ipfs.io/ipfs/')
      : srcObj.src;
    source.type = srcObj.type;
    video.appendChild(source);
  });

  video.load();
  document.body.appendChild(video);
  return video;
}

// Add a play/pause icon centered on the mesh
function addPlayIcon(mesh, video) {
  const loader = new TextureLoader();
  loader.load(PLAY_ICON_PATH, iconTex => {
    // Compute icon size as 20% of the smaller mesh scale axis
    const scales = mesh.scale;
    const baseSize = Math.min(scales.x, scales.y) * 0.2;
    const iconGeo = new PlaneGeometry(baseSize, baseSize);
    const iconMat = new MeshBasicMaterial({
      map: iconTex,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const icon = new Mesh(iconGeo, iconMat);
    icon.name = `playIcon_${video.id}`;
    icon.position.set(0, 0, 0.01);
    mesh.add(icon);

    video.addEventListener('play', () => (icon.visible = false));
    video.addEventListener('pause', () => (icon.visible = true));
    video.addEventListener('ended', () => (icon.visible = true));
    icon.visible = video.paused;
  });
}

/**
 * Replace each original 'Video' mesh with a fresh one:
 * - Creates a new 1x1 plane
 * - Uses video aspect and original world scale to size it
 * - Copies position & orientation
 * - Applies a new opaque material with the video texture
 * - Adds a play/pause icon overlay
 */
export function applyVideoMeshes(scene, galleryConfig) {
  const configMap = new Map((galleryConfig.videos || []).map(cfg => [cfg.id, cfg]));

  // Temp variables
  const worldPos = new Vector3();
  const worldQuat = new Quaternion();
  const worldScale = new Vector3();

  scene.traverse(obj => {
    if (!obj.isMesh || obj.userData.type !== 'Video') return;

    const cfg = configMap.get(obj.userData.elementID);
    if (!cfg) {
      console.warn(`No video config for ID ${obj.userData.elementID}`);
      return;
    }

    const video = ensureVideoElement(cfg);
    if (!video) return;

    video.addEventListener('loadedmetadata', () => {
      // Prepare video texture
      const tex = new VideoTexture(video);
      tex.colorSpace = SRGBColorSpace;

      // Determine aspect ratio
      const aspect = video.videoWidth / video.videoHeight;

      // Clone world transform
      obj.getWorldPosition(worldPos);
      obj.getWorldQuaternion(worldQuat);
      obj.getWorldScale(worldScale);

      // Create a unit plane and scale by aspect and original scale
      const planeGeo = new PlaneGeometry(1, 1);
      const mat = new MeshBasicMaterial({
        map: tex,
        side: DoubleSide,
        transparent: false,
        depthTest: true,
        depthWrite: true
      });
      const videoMesh = new Mesh(planeGeo, mat);
      videoMesh.name = `videoMesh_${video.id}`;

      // Apply transforms: scale.x scaled by aspect
      videoMesh.scale.set(worldScale.x * aspect, worldScale.y, worldScale.z);
      videoMesh.position.copy(worldPos);
      videoMesh.quaternion.copy(worldQuat);

      // Manual adjustment: flip 180° on Y, shift X
      videoMesh.rotateY(Math.PI);
      videoMesh.position.x += (worldScale.x * -0.1);

      // Add play/pause icon
      addPlayIcon(videoMesh, video);

      scene.add(videoMesh);

      // Start video
      video.play();
      tex.needsUpdate = true;
    });
  });
}
