// src/modules/ModelLoader.js
import {
  Group,
  Mesh,
  Scene,
  PerspectiveCamera
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { StaticGeometryGenerator, MeshBVH } from 'three-mesh-bvh';

export default class ModelLoader {
  constructor(deps, scene, newFloor = null) {
    this.deps = deps;
    this.scene = scene;

    this.newFloor = newFloor;
    this.environment = new Group();
    this.toMerge = {};
    this.currentModel = 0;         // ✅ start at 0
    this.totalModels = 2;          // ✅ main + interactives

    this.ktx2Loader = deps.ktx2Loader.setTranscoderPath('./libs/basis/');
    // ✅ detect support only if not already done
    if (!this.ktx2Loader._supportChecked) {
      try {
        deps.renderer.render(new Scene(), new PerspectiveCamera());
        this.ktx2Loader.detectSupport(deps.renderer);
      } catch (err) {
        console.warn('⚠️ KTX2 detectSupport failed:', err);
      }
      this.ktx2Loader._supportChecked = true;
    }

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
    try {
      // Load exhibition model
      const gltfScene = await this.loadGLTFModel(modelPath);
      this.currentModel++;

      // Load interactives
      const exhibitObjects = await this.loadGLTFModel(interactivesPath);
      this.currentModel++;

      this.processExhibitObjects(exhibitObjects);
      gltfScene.add(exhibitObjects);

      // Merge into environment
      this.processSceneObjects(gltfScene);

      // Collider for navigation
      const collider = this.createCollider();
      this.scene.add(collider);
      this.deps.collider = collider;

      this.scene.add(this.environment);
      this.scene.updateMatrixWorld(true);

      return collider;
    } catch (err) {
      console.error("Error loading model:", err);
      throw err;
    }
  }

  async loadGLTFModel(modelPath) {
    const onProgress = (xhr) => {
      if (xhr.total && this.deps.onProgress) {
        // ✅ progress for this file (0–100)
        const localPercent = xhr.loaded / xhr.total;

        // ✅ global progress = (done + current portion) / total
        const globalPercent = Math.round(
          ((this.currentModel + localPercent) / this.totalModels) * 100
        );

        this.deps.onProgress(globalPercent);
      }
    };

    const { scene: gltfScene } = await this.gltfLoader.loadAsync(modelPath, onProgress);
    gltfScene.updateMatrixWorld(true);
    return gltfScene;
  }

  processExhibitObjects(objects) {
    objects.traverse(obj => {
      if (obj.isMesh) {
        obj.wireframe = true;
        obj.material.transparent = true;
        obj.material.opacity = 0;
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
    collider.material.opacity = 0;
    collider.material.transparent = true;
    collider.material.color = 0x00ffff;
    collider.visible = true;
    collider.name = 'collider';

    collider.position.set(0, 0, 0);
    collider.castShadow = true;
    collider.receiveShadow = true;

    return collider;
  }
}
