// src/modules/AppBuilder.js

import initRenderer from './initRenderer';
import initScene from './initScene.js';
import initCamera from './initCamera.js';
import initControls from './initControls.js';
import ModelLoader from './ModelLoader.js';
import { setupResizeHandler } from './resizeHandler.js';
import { createVideoMeshes } from './createVideoMeshes.js';
import { PointerHandler } from './PointerHandler.js';
import { AmbientLight, Clock, BufferGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, WebGLRenderer, RingGeometry, DoubleSide, Vector3, Spherical, MathUtils } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import Visitor from './Visitor.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import initMapRenderer from './initMapRenderer.js';
import rotateOrbit from './rotateOrbit.js';
import { setupModal } from './setupModal.js';
/*
import {
  buildSidebar,
  addSidebarListeners,
  setupSidebarButtons
} from './sidebar.js';
*/
const ktx2Loader = new KTX2Loader().setTranscoderPath('./libs/basis/')
const clock = new Clock();
const cameraDir = new Vector3();
let dt, pos;

export async function buildGallery(config, container = document.body) {
  const {
    modelBlob,
    interactivesBlob,
    backgroundImg,
    modelPath,
    interactivesPath,
    backgroundTexture,
    //sidebar,
    images,
    params
  } = config;

  console.log("config appbuilder", config.videos)

  console.log("params build gallery", params)
  // INIT renderers, scenes, cameras...
  const renderer = initRenderer(container);
  ktx2Loader.detectSupport(renderer);

  const scene = initScene(backgroundImg || backgroundTexture, ktx2Loader, 'mainScene');
  scene.add(new AmbientLight(0xffffff, 2));

  Mesh.prototype.raycast = acceleratedRaycast;
  BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

  const camera = initCamera();
  setupResizeHandler(renderer, camera);

  const controls = initControls(camera, renderer.domElement);

  const rendererMap = initMapRenderer({ width: 500, height: 500 });

  const sceneMap = initScene(null, rendererMap, 'sceneMap');
  sceneMap.add(new AmbientLight(0xffffff, 2));

  // circle pointer on sceneMap
  const circle = new Mesh(
    new RingGeometry(0.1, 1, 32),
    new MeshBasicMaterial({ color: 0xa2c7ff, side: DoubleSide, transparent: true, opacity: 0.8, depthWrite: false })
  );
  circle.name = 'circleMap';
  circle.rotation.x = Math.PI / 2;
  circle.material.depthTest = false;
  sceneMap.add(circle);

  const cameraMap = new OrthographicCamera(-40, 40, 40, -40, 0.1, 1000);
  cameraMap.position.set(10, 50, 10);
  cameraMap.up.set(0, 0, -1);
  cameraMap.lookAt(0, 0, 0);

  const css2DMap = new CSS2DRenderer();
  css2DMap.setSize(500, 500);
  css2DMap.domElement.style.cssText = 'position:absolute;top:0;pointer-events:none';

  const deps = {
    ktx2Loader,
    camera,
    controls,
    scene,
    sceneMap,
    cameraMap,
    renderer,
    rendererMap,
    css2DRenderer: css2DMap,
    params,
    visitorMapCircle: circle
  };

  //

  // VISITOR 
  const visitor = new Visitor(deps);
  deps.visitor = visitor;
  scene.add(visitor);


 // modal setup
  const popupCallback = setupModal(images);
  new PointerHandler({ camera, scene, visitor, popupCallback, deps });

  // LOADING MODELS
  const modelLoader = new ModelLoader(deps, scene);

  if (modelBlob && interactivesBlob) {
    await modelLoader.loadModelFromBlob(modelBlob, interactivesBlob);
  } else {
    await modelLoader.loadModel(modelPath, interactivesPath);
  }

  // VIDEO
  createVideoMeshes(scene, config);

  // RESET
  scene.updateMatrixWorld(true);
  visitor.reset();

  //
  rotateOrbit(camera, controls, -120);
/*
  // SIDEBAR SETUP
  if (sidebar) {
    buildSidebar(sidebar);
    setupSidebarButtons(deps);
    addSidebarListeners();
  }
*/
  // ANIMATE SCENES 
  function animate() {
    if (!scene || !camera || !renderer || !controls) return;

    requestAnimationFrame(animate);

    dt = Math.min(clock.getDelta(), 0.1);

    if (deps.visitor && deps.collider) deps.visitor.update(dt, deps.collider);
    if (deps.visitorMapCircle) {

      pos = deps.visitor.position.clone();
      pos.y += 4;
      deps.visitorMapCircle.position.copy(pos);
    }

    controls.update();
    renderer.render(scene, camera);

  }
  //

  function animateMap() {
    if (!sceneMap || !cameraMap || !rendererMap || !css2DMap || !camera) return;

    requestAnimationFrame(animateMap);

    camera.getWorldDirection(cameraDir);
    sceneMap.rotation.y = -Math.atan2(cameraDir.x, cameraDir.z) + Math.PI;
    sceneMap.updateMatrixWorld();
    rendererMap.render(sceneMap, cameraMap);
    css2DMap.render(sceneMap, cameraMap);
  }

  animate();
  animateMap();
  hideOverlay();
}


function hideOverlay() {
  const overlay = document.getElementById('overlay');
  const sidebar = document.querySelector('.sidebar');
  const btn = document.getElementById('btn');

  if (!overlay) return;

  overlay.style.transition = 'opacity 1s ease';
  overlay.style.opacity = '0';

  setTimeout(() => {
    overlay.style.display = 'none';
    /*
    if (sidebar && !sidebar.classList.contains('open')) {
      sidebar.style.display = 'flex';
      sidebar.classList.add('open');
    }
    if (btn && !btn.classList.contains('show')) {
      btn.style.display = 'block';
      btn.classList.add('show');
    }
    if (btn && !btn.classList.contains('open')) {
      btn.style.display = 'block';
      btn.classList.add('open');
    }
      */
  }, 1000);
}

