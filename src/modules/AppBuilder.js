// src/modules/AppBuilder.js

import initRenderer from './initRenderer.ts';
import initScene from './initScene.js';
import initCamera from './initCamera.js';
import initControls from './initControls.js';
import ModelLoader from './ModelLoader.js';
import { setupResizeHandler } from './resizeHandler.js';
import { applyVideoMeshes } from './applyVideoMeshes.js';
import { createAudioMeshes } from './createAudioMeshes.js';
import { PointerHandler } from './PointerHandler.js';
import { AudioListener, AmbientLight, Clock, BufferGeometry, Mesh } from 'three';
import Visitor from './Visitor.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { setupModal } from './setupModal.js';
import ktx2Loader from '../loaders/ktx2Loader.ts'; // Adjust path as needed

const clock = new Clock();

export async function buildGallery(config, container = document.body) {
  // --- Scoped resource handles ---
  let renderer = null;
  let scene = null;
  let visitor = null;
  let controls = null;
  let animationId = null;
  let deps = null;

  console.log('🎨 Building gallery...', config)

  // --- Disposal method ---
  function dispose() {

    console.log('🎨 Disposing gallery...');
    // Cancel animation
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    // Controls
    if (controls && typeof controls.dispose === 'function') {
      controls.dispose();
      controls = null;
    }
    // Visitor
    if (visitor && typeof visitor.dispose === 'function') {
      visitor.dispose();
      visitor = null;
    }
    // Scene
    if (scene) {
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => mat.dispose && mat.dispose());
          } else {
            obj.material.dispose && obj.material.dispose();
          }
        }
        if (obj.texture) obj.texture.dispose();
      });
      scene.clear && scene.clear();
      scene = null;
    }
    // Renderer
    if (renderer) {
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose && renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
      renderer = null;
    }
    // Remove any leftover <video> elements from this gallery
    if (config.videos) {
      console.log('🎨 Removing video elements...');
      config.videos.forEach(cfg => {
        const vid = document.getElementById(cfg.id);
        if (vid && vid.parentNode) vid.parentNode.removeChild(vid);
      });
    }

    deps = null;
  }

  // --- Actually build gallery ---
  // Always dispose previous content in the container!
  // (If using a shared container, make sure it's empty)
  while (container.firstChild) container.removeChild(container.firstChild);

  // Start fresh!
  const {
    modelBlob, interactivesBlob, backgroundImg,
    modelPath, interactivesPath, backgroundTexture, images, params
  } = config;

  renderer = initRenderer(container);
  ktx2Loader.detectSupport(renderer);

  console.log("blur", params.backgroundBlurriness);

  scene = initScene(backgroundImg || backgroundTexture, ktx2Loader, 'mainScene', params.backgroundBlurriness, params.backgroundIntensity, params.lightIntensity);

  Mesh.prototype.raycast = acceleratedRaycast;
  BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

  const camera = initCamera();

  // Audio listener
  const listener = new AudioListener();
  listener.name = 'MainAudioListener';

  setupResizeHandler(renderer, camera);

  controls = initControls(camera, renderer.domElement);

  deps = {
    ktx2Loader, camera, listener, controls, renderer, params, audioObjects: [],
  };

  // Load models
  const modelLoader = new ModelLoader(deps, scene);

  if (modelBlob && interactivesBlob) {
    await modelLoader.loadModelFromBlob(modelBlob, interactivesBlob);
  } else {
    await modelLoader.loadModel(modelPath, interactivesPath);
  }

  // Video
  applyVideoMeshes(scene, config);

  // Audio
  deps.audioObjects = createAudioMeshes(scene, listener, deps.audioObjects);



  // Visitor (user avatar)
  visitor = new Visitor(deps);
  deps.visitor = visitor;


  // Modal setup and pointer handler
  const popupCallback = setupModal(images);
  new PointerHandler({ camera, scene, visitor, popupCallback, deps });

  camera.add(listener);
  visitor.reset();
  scene.add(visitor);



  // --- Animation loop ---//
  function animate() {
    if (!scene || !camera || !renderer || !controls) return;
    animationId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (deps.visitor && deps.collider) deps.visitor.update(dt, deps.collider);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  hideOverlay();

  // --- Return a disposer object ---

  return { dispose };
}

// --- Util ---
function hideOverlay() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.style.transition = 'opacity 1s ease';
  overlay.style.opacity = '0';
  setTimeout(() => { overlay.style.display = 'none'; }, 1000);
}
