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

    // IPFS gateway handling for glTF and its referenced resources
    this.ipfsGateways = [
      'https://cloudflare-ipfs.com/ipfs/',
      'https://ipfs.io/ipfs/',
      'https://gateway.pinata.cloud/ipfs/',
      'https://dweb.link/ipfs/'
    ];
    this.currentIpfsGatewayIndex = 0;
  }

  setupLoaders() {
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  // Map any ipfs:// URL that three.js requests (including buffers/textures) to the current gateway
  setURLModifierForGateway(gatewayBase) {
    const manager = this.gltfLoader.manager;
    if (!manager) return;
    manager.setURLModifier((url) => {
      if (typeof url === 'string' && url.startsWith('ipfs://')) {
        const cidPath = url.replace('ipfs://', '');
        return gatewayBase + cidPath;
      }
      return url;
    });
  }

  async loadModel(modelPath, interactivesPath, ipfsModelPath = null, ipfsInteractivesPath = null) {
    try {
      // Load exhibition model
      const gltfScene = await this.loadGLTFModel(modelPath, ipfsModelPath);
      this.currentModel++;

      // Load interactives
      const exhibitObjects = await this.loadGLTFModel(interactivesPath, ipfsInteractivesPath);
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

  async loadGLTFModel(modelPath, ipfsFallback = null) {
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

    const isIpfs = typeof modelPath === 'string' && modelPath.startsWith('ipfs://');

    if (isIpfs) {
      // Try multiple gateways for ipfs:// URLs
      let lastErr;
      for (let i = 0; i < this.ipfsGateways.length; i++) {
        const gateway = this.ipfsGateways[i];
        this.currentIpfsGatewayIndex = i;
        this.setURLModifierForGateway(gateway);
        const resolved = gateway + modelPath.replace('ipfs://', '');
        try {
          const { scene: gltfScene } = await this.gltfLoader.loadAsync(resolved, onProgress);
          gltfScene.updateMatrixWorld(true);
          return gltfScene;
        } catch (err) {
          lastErr = err;
          // try next gateway
        }
      }
      // All gateways failed
      throw lastErr || new Error(`Failed to load GLTF from IPFS: ${modelPath}`);
    }

    // HTTP(S) path, attempt normal load; on failure, try ipfsFallback if provided
    try {
      const { scene: gltfScene } = await this.gltfLoader.loadAsync(modelPath, onProgress);
      gltfScene.updateMatrixWorld(true);
      return gltfScene;
    } catch (err) {
      if (!ipfsFallback || typeof ipfsFallback !== 'string' || !ipfsFallback.startsWith('ipfs://')) {
        throw err;
      }
      // Fallback to IPFS gateways using the provided ipfsFallback path
      let lastErr;
      for (let i = 0; i < this.ipfsGateways.length; i++) {
        const gateway = this.ipfsGateways[i];
        this.currentIpfsGatewayIndex = i;
        this.setURLModifierForGateway(gateway);
        const resolved = gateway + ipfsFallback.replace('ipfs://', '');
        try {
          const { scene: gltfScene } = await this.gltfLoader.loadAsync(resolved, onProgress);
          gltfScene.updateMatrixWorld(true);
          return gltfScene;
        } catch (err2) {
          lastErr = err2;
        }
      }
      throw lastErr || err;
    }
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
