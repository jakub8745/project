// src/modules/ModelLoader.js
import {
  Group,
  Mesh,
  MathUtils,
  AudioLoader,
  PositionalAudio,
  MeshBasicMaterial,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { StaticGeometryGenerator, MeshBVH } from 'three-mesh-bvh';
import { PositionalAudioHelper } from 'three/examples/jsm/helpers/PositionalAudioHelper.js';

export default class ModelLoader {
  constructor(deps, scene, newFloor = null) {
    this.deps = deps;
    this.scene = scene;
    this.sceneMap = deps.sceneMap;

    this.newFloor = newFloor;
    this.environment = new Group();
    this.toMerge = {};
    this.addToSceneMapRun = true;
    this.currentModel = 1;
    this.totalModels = 2;

    this.ktx2Loader = deps.ktx2Loader.setTranscoderPath('./libs/basis/');
    this.ktx2Loader.detectSupport(deps.renderer); // ✅ THIS is required

    this.manager = deps.manager || undefined;
    this.gltfLoader = new GLTFLoader(this.manager);
    this.dracoLoader = new DRACOLoader(this.manager).setDecoderPath('./libs/draco/');

    this.setupLoaders();

  }

  setupLoaders() {
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  async loadModel(modelPath, interactivesPath) {

    if (this.scene === this.deps.sceneMap) {
      this.addToSceneMapRun = false;
    }

    try {

      const gltfScene = await this.loadGLTFModel(modelPath, this.currentModel, this.totalModels);
      this.adjustFloor(gltfScene);

      this.currentModel++;
      const exhibitObjects = await this.loadGLTFModel(interactivesPath, this.currentModel, this.totalModels);

      this.processExhibitObjects(exhibitObjects);
      gltfScene.add(exhibitObjects);

      this.processSceneObjects(gltfScene);

      const collider = this.createCollider();
      this.scene.add(collider);
      this.deps.collider = collider;

      this.scene.add(this.environment);
      this.customizeEnvironment();

      this.scene.updateMatrixWorld(true);


      return collider;
    } catch (err) {
      console.error('Error loading model:', err);
      throw err;
    }
  }

  async loadGLTFModel(modelPath, currentModel, totalModels) {
    const progressText = document.getElementById('progress-text');
    const onProgress = (xhr) => {
      if (xhr.total) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        if (progressText) progressText.textContent = `Loading model ${currentModel}/${totalModels}: ${percent}%`;
      }
    };

    const { scene: gltfScene } = await this.gltfLoader.loadAsync(modelPath, onProgress);
    gltfScene.updateMatrixWorld(true);
    return gltfScene;
  }

  async loadModelFromBlob(modelBlob, interactivesBlob) {
    if (this.scene === this.deps.sceneMap) {
      this.addToSceneMapRun = false;
    }

    try {
      const gltfScene = await this.loadGLTFBlob(modelBlob, this.currentModel, this.totalModels);
      this.adjustFloor(gltfScene);

      this.currentModel++;
      const exhibitObjects = await this.loadGLTFBlob(interactivesBlob, this.currentModel, this.totalModels);

      this.processExhibitObjects(exhibitObjects);
      gltfScene.add(exhibitObjects);

      this.processSceneObjects(gltfScene);

      const collider = this.createCollider();
      this.scene.add(collider);
      this.deps.collider = collider;

      this.scene.add(this.environment);
      this.customizeEnvironment();

      this.scene.updateMatrixWorld(true);

      return collider;
    } catch (err) {
      console.error('Error loading model from blob:', err);
      throw err;
    }
  }

  async loadGLTFBlob(blob, currentModel, totalModels) {
    const progressText = document.getElementById('progress-text');

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { scene: gltfScene } = await new Promise((resolve, reject) => {
      this.gltfLoader.parse(buffer.buffer, '', resolve, reject);
    });

    if (progressText) {
      progressText.textContent = `Loaded model ${currentModel}/${totalModels}`;
    }

    gltfScene.updateMatrixWorld(true);
    return gltfScene;
  }


  adjustFloor(scene) {
    scene.traverse(obj => {
      if (obj.isMesh && obj.name === 'FloorOut') {
        obj.position.y -= 0.1;
      }
    });
  }

  processExhibitObjects(objects) {
    objects.traverse(obj => {
      if (obj.isMesh) {
        obj.wireframe = true;
        obj.material.transparent = true;
        obj.material.opacity = 0.0;
        obj.interactive = true;
      }
    });
  }

  processSceneObjects(scene) {
    scene.traverse(obj => {
      if (obj.isMesh || obj.isLight) {
        if (obj.isLight) obj.visible = false;
        const type = obj.userData.type;
        this.toMerge[type] = this.toMerge[type] || [];
        this.toMerge[type].push(obj);

      }
    });
    this.mergeSceneObjects();
  }

  mergeSceneObjects() {
    for (const type in this.toMerge) {
      for (const mesh of this.toMerge[type]) {
        if (mesh.userData.name === 'ciprianiAudio') {
          this.createAudio(mesh);
        }
        this.environment.attach(mesh);
      }
    }
    this.environment.name = 'environment';
  }

  createCollider() {

    const staticGen = new StaticGeometryGenerator(this.environment);
    staticGen.attributes = ['position'];
    const merged = staticGen.generate();

    merged.boundsTree = new MeshBVH(merged, { lazyGeneration: false });

    const collider = new Mesh(merged);
    collider.material.wireframe = true;
    collider.material.opacity = 1;
    collider.material.transparent = true;
    collider.visible = false;
    collider.name = 'collider';

    return collider;
  }

  customizeEnvironment() {
    this.environment.traverse(obj => {
      const type = obj.userData.type || obj.userData.name;
      if (this.scene.name === 'mainScene' && /Wall|visitorLocation|Video|Image|Room/.test(type)) {
        this.addToSceneMap(obj);
      }
    });
  }

  createAudio(mesh) {
    const sound = new PositionalAudio(this.deps.listener);
    const loader = new AudioLoader();

    loader.load(mesh.userData.audio, buffer => {
      sound.setBuffer(buffer);
      sound.setLoop(true);
      sound.setRefDistance(mesh.userData.audioRefDistance || 1);
      sound.setRolloffFactor(mesh.userData.audioRolloffFactor || 1);
      sound.setVolume(mesh.userData.audioVolume || 1);
      sound.setDirectionalCone(10, 23, 0.1);

      const helper = new PositionalAudioHelper(sound, 20);
      // sound.add(helper);

      mesh.scale.setScalar(0.1);
      mesh.rotateX(Math.PI / 2);
      mesh.rotation.y += MathUtils.degToRad(120);

      mesh.add(sound);
      this.deps.audioObjects?.push(sound);
    });
  }

  addToSceneMap(mesh) {
    if (!this.addToSceneMapRun) return;

    const { sceneMap, visitorEnter, resetVisitor } = this.deps;
    const clone = mesh.clone();

    clone.material = new MeshBasicMaterial({
      color: ['visitorLocation', 'Image', 'Video', 'Room'].includes(clone.userData.type) ? 0x1b689f : 0xcccccc,
      opacity: ['visitorLocation', 'element', 'Room'].includes(clone.userData.type) ? 0.8 : 1,
      transparent: true,
      depthWrite: false
    });

    const edges = new EdgesGeometry(clone.geometry);
    const edgeLines = new LineSegments(edges, new LineBasicMaterial({ color: 0x00000f }));
    edgeLines.position.copy(clone.position);
    edgeLines.rotation.copy(clone.rotation);
    edgeLines.scale.copy(clone.scale);

    sceneMap.add(clone);
    sceneMap.add(edgeLines);

    if (mesh.userData.label) {
      const div = document.createElement('div');
      div.className = 'label';
      div.textContent = mesh.userData.label;
      div.style.marginTop = '1em';
      div.style.pointerEvents = 'auto';

      div.addEventListener('click', () => {
        visitorEnter.copy(mesh.position.clone());
        resetVisitor?.();
      });

      const labelObj = new CSS2DObject(div);
      labelObj.position.set(10, 0, -5);
      clone.add(labelObj);
    }
  }
}
