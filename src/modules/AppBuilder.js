// src/modules/AppBuilder.js

import initRenderer from './initRenderer.ts';
import initScene from './initScene.js';
import initCamera from './initCamera.js';
import initControls from './initControls.js';
import ModelLoader from './ModelLoader.js';
import { setupResizeHandler } from './resizeHandler.js';
import { applyVideoMeshes } from './applyVideoMeshes.js';
import { applyAudioMeshes } from './applyAudioMeshes.js';
import { PointerHandler } from './PointerHandler.js';
import { AudioListener, Clock, BufferGeometry, Mesh, SpotLight, Vector3, Vector2 } from 'three';
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


  const { orbit: controls, transform } = initControls(camera, renderer.domElement, {
    onChange: () => renderer.render(scene, camera),
  });





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
  applyAudioMeshes(scene, config, listener);


  // Visitor (user avatar)
  visitor = new Visitor(deps);
  deps.visitor = visitor;


  // Modal setup and pointer handler
  const popupCallback = setupModal(images);
  new PointerHandler({ camera, scene, visitor, popupCallback, deps });

  camera.add(listener);
  visitor.reset();
  scene.add(visitor);

  //scene.add(transform);

  const targetObj = findByUserDataType(scene, "Pitcher");



  if (targetObj) {

    transform.attach(targetObj);
    transform.setMode('rotate'); // or 'translate' | 'scale'
    transform.setSize(0.5);

    const gizmo = transform.getHelper();
    gizmo.visible = false;
    scene.add(gizmo);


    // re-use the internal raycaster
    const raycaster = transform.getRaycaster();
    const pointer = new Vector2();

    function updatePointer(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    renderer.domElement.addEventListener('pointermove', (e) => {
      updatePointer(e);

      // use the transform's raycaster with the current mouse position
      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObject(targetObj, true);
      gizmo.visible = intersects.length > 0;
    });

    window.addEventListener('keydown', (e) => {


      switch (e.key.toLowerCase()) {
        case 'v':
          gizmo.visible = !gizmo.visible;
          break;

        case 't':
          transform.setMode('translate');
          break;

        case 'r':
          transform.setMode('rotate');
          break;

      }
    });

    const spot = new SpotLight(0xffffff, 50);
    spot.angle = Math.PI / 6;
    spot.penumbra = 0.2;
    spot.decay = 2;
    spot.distance = 50;

    // enable shadows on the light
    spot.castShadow = true;
    spot.shadow.mapSize.width = 2048;
    spot.shadow.mapSize.height = 2048;
    spot.shadow.bias = -0.0001; // tweak to avoid acne


    scene.add(spot);
    scene.add(spot.target);

    const tmpPos = new Vector3();

    // Update spotlight whenever transform changes
    transform.addEventListener('change', (e) => {

      targetObj.getWorldPosition(tmpPos);
      spot.position.set(tmpPos.x, tmpPos.y + 5, tmpPos.z);
      spot.target.position.copy(tmpPos);

      gizmo.visible = e.value;
    });

  } else {
    console.warn('No object with userData.type === "Pitcher" found.');
  }

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
// Find the first object with userData.type === wantedType
function findByUserDataType(root, wantedType) {
  let found = null;
  root.traverse((obj) => {
    if (found) return;
    if (obj.userData && obj.userData.type === wantedType) {
      found = obj;
    }
  });
  return found;
}