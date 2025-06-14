import {
  VideoTexture,
  TextureLoader,
  MeshBasicMaterial,
  DoubleSide,
  SRGBColorSpace,
  PlaneGeometry,
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

// Add a play/pause icon overlay to the mesh
function addPlayIcon(mesh, video) {
  const loader = new TextureLoader();
  loader.load(PLAY_ICON_PATH, iconTex => {
    const baseSize = Math.min(mesh.scale.x, mesh.scale.y) * 3;
    const iconGeo = new PlaneGeometry(baseSize, baseSize);
    const iconMat = new MeshBasicMaterial({
      map: iconTex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide

    });
    const iconMesh = new Mesh(iconGeo, iconMat);
    iconMesh.name = `playIcon_${video.id}`;
    iconMesh.position.set(0, 0, 0);
    iconMesh.rotation.set(0, 0, Math.PI);
    iconMesh.renderOrder = 999;
    mesh.add(iconMesh);

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
 * - Ensures depthTest/write for full visibility
 */
export function applyVideoMeshes(scene, galleryConfig) {

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
      newMat.needsUpdate = true;

      obj.material = newMat;

      addPlayIcon(obj, video);

      video.currentTime = 0.01
      video.pause();

      texture.needsUpdate = true;


    });
  });
}
