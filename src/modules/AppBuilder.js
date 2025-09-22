// src/modules/AppBuilder.js

import initRenderer from './initRenderer.ts';
import initScene from './initScene.js';
import initCamera from './initCamera.js';
import initControls from './initControls.js';
import ModelLoader from './ModelLoader.js';
import { setupResizeHandler } from './resizeHandler.js';
import { applyVideoMeshes } from './applyVideoMeshes.js';
import { applyAudioMeshes, disposeAudioMeshes } from './applyAudioMeshes.js';

import { PointerHandler } from './PointerHandler.js';
import { VRPointerHandler } from './VRPointerHandler.js';

import { AudioListener, Clock, BufferGeometry, Mesh, Group, ACESFilmicToneMapping, WebGLRenderTarget } from 'three';
import Visitor from './Visitor.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import ktx2Loader from '../loaders/ktx2Loader.ts'; // Adjust path as needed

const clock = new Clock();

// 🔑 injected from React
let showModalFn = null;
export function initAppBuilder({ showModal }) {
  showModalFn = showModal;
}

// --- Build gallery ---
export async function buildGallery(config, container, { onProgress } = {}) {

  if (!container) throw new Error("No container provided to buildGallery");

  let renderer = null;
  let scene = null;
  let visitor = null;
  let animationId = null;
  let deps = null;


  // --- Disposal method ---
  function dispose() {
    console.log('🎨 Disposing gallery...');

    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (controls && typeof controls.dispose === 'function') {
      controls.dispose();
      controls = null;
    }

    if (transform) {
      try {
        transform.detach();
        if (transform.getHelper) {
          const gizmo = transform.getHelper();
          if (gizmo && scene) scene.remove(gizmo);
        }
        window.removeEventListener('keydown', transform._onKeyDown, false);
        renderer?.domElement.removeEventListener('pointermove', transform._onPointerMove, false);
      } catch (err) {
        console.warn('⚠️ Error disposing transform controls', err);
      }
      transform = null;
    }

    if (visitor && typeof visitor.dispose === 'function') {
      visitor.dispose();
      visitor = null;
    }

    disposeAudioMeshes();

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

    if (renderer) {
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose && renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
      renderer = null;
    }

    if (config.videos) {
      config.videos.forEach(cfg => {
        const vid = document.getElementById(cfg.id);
        if (vid && vid.parentNode) vid.parentNode.removeChild(vid);
      });
    }

    deps = null;
  }

  // --- Clean container ---
  while (container.firstChild) container.removeChild(container.firstChild);

  const {
    modelBlob, interactivesBlob, backgroundImg,
    modelPath, interactivesPath, backgroundTexture, images, params
  } = config;

  // ✅ renderer with guaranteed canvas
  renderer = await initRenderer(container);

  // Tone mapping setup and initial exposure from config
  try {
    renderer.toneMapping = ACESFilmicToneMapping;
    if (config?.params?.exposure != null) {
      const exp = Number(config.params.exposure);
      if (Number.isFinite(exp)) renderer.toneMappingExposure = exp;
    }
  } catch {}

  ktx2Loader.setTranscoderPath('./libs/basis/');
  ktx2Loader.detectSupport(renderer);

  // ✅ Scene after renderer exists
  scene = initScene(
    backgroundImg || backgroundTexture,
    ktx2Loader,
    'mainScene',
    params.backgroundBlurriness,
    params.backgroundIntensity,
    params.lightIntensity
  );

  // BVH setup
  Mesh.prototype.raycast = acceleratedRaycast;
  BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

  const camera = initCamera();

  // XR rig: parent for camera when in VR so we can move the user by moving the rig
  const xrRig = new Group();
  xrRig.name = 'xrRig';
  xrRig.add(camera);
  scene.add(xrRig);

  const listener = new AudioListener();
  listener.name = 'MainAudioListener';

  setupResizeHandler(renderer, camera);

  let controls, transform;
  ({ orbit: controls, transform } = initControls(camera, renderer.domElement, {
    onChange: () => {
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    },
  }));

  deps = {
    ktx2Loader,
    camera,
    listener,
    controls,
    renderer,
    params,
    audioObjects: [],
    onProgress,
    xrRig,
    links: config?.links || {},
    imagesMeta: config?.images || {}
  };

  // ✅ Visitor + PointerHandler BEFORE async loads
  visitor = new Visitor(deps);

  deps.visitor = visitor;
  camera.add(listener);

  // if (renderer?.xr?.isPresenting) {
  // ✅ VR mode: don’t touch camera or OrbitControls
  // The XR system updates camera pose, relative to world
  // visitor.add(camera);

  // }



  visitor.reset();
  scene.add(visitor);

  // Desktop / WebGL
  if (showModalFn) {
    new PointerHandler({ camera, scene, visitor, popupCallback: showModalFn, deps });
  } else {
    console.warn("⚠️ AppBuilder: showModal not initialized, modal won't work");
  }

  // VR
  new VRPointerHandler({ scene, visitor, renderer });

  // ✅ Now do async model + media loading
  const modelLoader = new ModelLoader(deps, scene);

  // Pass onProgress down
  await modelLoader.loadModel(
    config.modelPath,
    config.interactivesPath,
    config.ipfsModelPath,
    config.ipfsInteractivesPath
  );

  //await modelLoader.loadModel(modelPath, interactivesPath);



  applyVideoMeshes(scene, camera, config);
  applyAudioMeshes(scene, config, listener, renderer, camera, transform);

  // --- Animation loop ---
  function initLoop() {
    if (!scene || !camera || !renderer || !controls) return;

    // --- Auto exposure (optional) ---
    const autoExposure = config?.params?.autoExposure !== false; // default on
    const targetGray = typeof config?.params?.exposureTarget === 'number' ? config.params.exposureTarget : 0.5;
    const exposureMin = typeof config?.params?.exposureMin === 'number' ? config.params.exposureMin : 0.5;
    const exposureMax = typeof config?.params?.exposureMax === 'number' ? config.params.exposureMax : 2.5;
    const sampleInterval = typeof config?.params?.exposureSampleInterval === 'number' ? Math.max(1, config.params.exposureSampleInterval) : 30;
    const sampleSize = 64;
    const rt = autoExposure ? new WebGLRenderTarget(sampleSize, sampleSize, { depthBuffer: false, stencilBuffer: false }) : null;
    const px = autoExposure ? new Uint8Array(sampleSize * sampleSize * 4) : null;
    let frameCounter = 0;

    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);

      if (deps.visitor && deps.collider) {
        deps.visitor.update(dt, deps.collider);
      }

      // Sample scene brightness at low res and adapt exposure
      if (autoExposure && rt && px) {
        frameCounter++;
        if (frameCounter % sampleInterval === 0) {
          try {
            renderer.setRenderTarget(rt);
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(rt, 0, 0, sampleSize, sampleSize, px);
            renderer.setRenderTarget(null);
            let sum = 0;
            const inv255 = 1 / 255;
            for (let i = 0; i < px.length; i += 4) {
              const r = px[i] * inv255;
              const g = px[i + 1] * inv255;
              const b = px[i + 2] * inv255;
              // Rec. 709 luma weights
              sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
            }
            const avg = sum / (sampleSize * sampleSize);
            if (Number.isFinite(avg) && avg > 0) {
              const current = renderer.toneMappingExposure || 1;
              // Scale exposure toward target gray; sqrt to reduce aggressiveness
              const desired = current * Math.sqrt(Math.max(0.001, targetGray) / Math.max(0.001, Math.min(1, avg)));
              const clamped = Math.min(exposureMax, Math.max(exposureMin, desired));
              // Smooth towards target
              renderer.toneMappingExposure = current + (clamped - current) * 0.15;
            }
          } catch (err) {
            // ignore sampling errors
            renderer.setRenderTarget(null);
          }
        }
      }

      controls.update();
      renderer.render(scene, camera);
    });
  }
  initLoop();

  hideOverlay();

  return { dispose };
}

// --- Utils ---
function hideOverlay() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.style.transition = 'opacity 1s ease';
  overlay.style.opacity = '0';
  setTimeout(() => { overlay.style.display = 'none'; }, 1000);
}
