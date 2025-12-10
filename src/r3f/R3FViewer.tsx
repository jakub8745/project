import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { Html, Loader, OrbitControls } from '@react-three/drei';
import type { Event, Vector3Tuple } from 'three';
import {
  AudioListener,
  BufferGeometry,
  Color,
  Euler,
  Vector3,
  Mesh,
  Group,
  Material,
  MeshBasicMaterial,
  WebGLRenderTarget,
  Object3D,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  EquirectangularReflectionMapping,
  LinearFilter,
  LinearMipmapLinearFilter
} from 'three';
import type { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { StaticGeometryGenerator, MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import Visitor from '../modules/Visitor.js';
import { useExhibitConfig } from './useExhibitConfig';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { TransformControlsEventMap } from 'three/examples/jsm/controls/TransformControls.js';
import type { VisitorParams } from '../modules/Visitor.js';
import { PointerInteractions } from './PointerInteractions';
import { applyVideoMeshes, type VideoMeshConfig } from '../modules/applyVideoMeshes.js';
import { useLegacyModal, type LegacyImageMap } from './useLegacyModal';
import { MaterialModalProvider } from './Modal';
import type { AudioMeshConfig } from '../modules/audioMeshManager.ts';
import { AudioMeshes } from './AudioMeshes';
import { AudioPlayerControls } from './AudioPlayerControls';
import sharedKtx2Loader from '../loaders/ktx2Loader';

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const DEBUG_COLLIDER = false;
const DEFAULT_BACKGROUND = '#111827';

let sharedDracoLoader: DRACOLoader | null = null;
let sharedLoaderUsers = 0;
const ktx2SupportedRenderers = new WeakSet<WebGLRenderer>();

type XRSessionConstructor = { new (...args: any[]): XRSession };
type XRWebGLBindingConstructor = { new (...args: any[]): unknown };

function temporarilyDisableXRWebGLBinding(session: XRSession | null) {
  if (typeof globalThis === 'undefined' || !session) {
    return null;
  }
  const globalWithXR = globalThis as typeof globalThis & {
    XRWebGLBinding?: XRWebGLBindingConstructor;
    XRSession?: XRSessionConstructor;
  };
  const originalBinding = globalWithXR.XRWebGLBinding;
  if (typeof originalBinding !== 'function') {
    return null;
  }

  const sessionCtor = globalWithXR.XRSession;
  let shouldDisable = false;
  if (typeof sessionCtor === 'function') {
    try {
      shouldDisable = !(session instanceof sessionCtor);
    } catch {
      shouldDisable = true;
    }
  } else {
    shouldDisable = true;
  }

  if (!shouldDisable) {
    return null;
  }

  globalWithXR.XRWebGLBinding = undefined;
  return () => {
    globalWithXR.XRWebGLBinding = originalBinding;
  };
}

function ensureKtx2Support(renderer: WebGLRenderer) {
  if (ktx2SupportedRenderers.has(renderer)) return;
  try {
    sharedKtx2Loader.detectSupport(renderer);
    ktx2SupportedRenderers.add(renderer);
  } catch (err) {
    console.warn('KTX2 detectSupport failed:', err);
  }
}

function acquireSharedLoaders(renderer: WebGLRenderer) {
  sharedLoaderUsers += 1;
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader().setDecoderPath('/libs/draco/');
  }
  ensureKtx2Support(renderer);
  return {
    draco: sharedDracoLoader,
    ktx2: sharedKtx2Loader as KTX2Loader
  };
}

function releaseSharedLoaders() {
  sharedLoaderUsers = Math.max(0, sharedLoaderUsers - 1);
  if (sharedLoaderUsers === 0) {
    sharedDracoLoader?.dispose?.();
    sharedDracoLoader = null;
  }
}

interface R3FViewerProps {
  configUrl: string | null;
  onRequestSidebarClose?: () => void;
}

function coerceVector(source: unknown, fallback: Vector3Tuple = [0, 0, 0]): Vector3Tuple {
  if (Array.isArray(source) && source.length === 3) {
    return [Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0];
  }
  if (source && typeof source === 'object') {
    const { x, y, z } = source as Record<string, unknown>;
    return [Number(x) || 0, Number(y) || 0, Number(z) || 0];
  }
  return fallback;
}

function toVector3(source: unknown, fallback: Vector3Tuple = [0, 0, 0]): Vector3 {
  const [x, y, z] = coerceVector(source, fallback);
  return new Vector3(x, y, z);
}

function useConfiguredGLTFs(paths: string[]): GLTF[] {
  const gl = useThree((state) => state.gl);

  const loaders = useMemo(() => acquireSharedLoaders(gl), [gl]);

  useEffect(() => {
    return () => {
      releaseSharedLoaders();
    };
  }, [loaders]);

  const gltfResults = useLoader(
    GLTFLoader,
    paths,
    (loader: GLTFLoader) => {
      loader.setDRACOLoader(loaders.draco!);
      loader.setKTX2Loader(loaders.ktx2!);
      loader.setMeshoptDecoder(MeshoptDecoder);
      return loader;
    }
  ) as GLTF | GLTF[];

  return Array.isArray(gltfResults) ? gltfResults : [gltfResults];
}

function cloneTransparentMaterial(material: Material): Material {
  const cloned = material.clone();
  cloned.transparent = true;
  cloned.opacity = 0;
  cloned.depthWrite = false;
  if ('colorWrite' in cloned) {
    cloned.colorWrite = false;
  }
  return cloned;
}

function ExhibitModel({
  modelPath,
  interactivesPath,
  position,
  rotation,
  scale,
  onColliderReady,
  onSceneReady,
  videosConfig
}: {
  modelPath: string;
  interactivesPath?: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  onColliderReady?: (collider: Mesh | null) => void;
  onSceneReady?: () => void;
  videosConfig?: VideoMeshConfig[];
}) {
  const loadTargets = useMemo(() => {
    const targets = [modelPath];
    if (interactivesPath) {
      targets.push(interactivesPath);
    }
    return targets;
  }, [interactivesPath, modelPath]);

  const gltfResults = useConfiguredGLTFs(loadTargets);
  const mainGltf = gltfResults[0] as GLTF | undefined;
  const interactivesGltf = gltfResults[1] as GLTF | undefined;
  const camera = useThree((state) => state.camera);

  type InteractiveMesh = Mesh & { interactive?: boolean };

  const { displayScene, collider } = useMemo(() => {
    if (!mainGltf?.scene) {
      const emptyResult: { displayScene: Group | null; collider: Mesh | null } = {
        displayScene: null,
        collider: null
      };
      return emptyResult;
    }

    const display = mainGltf.scene.clone(true) as Group;
    display.name = 'r3f-display-root';
    display.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    if (interactivesGltf?.scene) {
      const interactives = interactivesGltf.scene.clone(true);
      interactives.name = 'r3f-interactives-layer';
      interactives.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const mesh = object as InteractiveMesh;
        if (mesh.userData?.type === 'Video') {
          // Preserve original material for video surfaces; applyVideoMeshes will swap it later.
          mesh.interactive = true;
          mesh.userData.interactive = true;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          return;
        }
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.interactive = true;
        mesh.userData.interactive = true;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((mat) => cloneTransparentMaterial(mat));
        } else if (mesh.material) {
          mesh.material = cloneTransparentMaterial(mesh.material);
        }
      });
      display.add(interactives);
    }

    const colliderSource = display.clone(true);
    colliderSource.updateMatrixWorld(true);
    const staticGen = new StaticGeometryGenerator(colliderSource);
    staticGen.attributes = ['position', 'normal'];
    const merged = staticGen.generate();
    merged.boundsTree = new MeshBVH(merged);
    const colliderMesh = new Mesh(merged);
    colliderMesh.name = 'r3f-collider';
    colliderMesh.visible = DEBUG_COLLIDER;

    const [px, py, pz] = position;
    const [rx, ry, rz] = rotation;
    colliderMesh.position.set(px, py, pz);
    colliderMesh.rotation.set(rx, ry, rz);
    colliderMesh.scale.setScalar(scale);

    if (DEBUG_COLLIDER) {
      colliderMesh.material = new MeshBasicMaterial({
        color: 0x00ffff,
        wireframe: true,
        transparent: true,
        opacity: 0.2
      });
      colliderMesh.renderOrder = 999;
    }

    colliderMesh.updateMatrixWorld(true);

    return { displayScene: display, collider: colliderMesh };
  }, [interactivesGltf, mainGltf, position, rotation, scale]);

  useEffect(() => {
    onColliderReady?.(collider);
    if (displayScene) {
      onSceneReady?.();
    }
    return () => {
      onColliderReady?.(null);
      collider?.geometry?.dispose?.();
    };
  }, [collider, displayScene, onColliderReady, onSceneReady]);

  useEffect(() => {
    if (!displayScene || !videosConfig || videosConfig.length === 0) {
      return;
    }
    applyVideoMeshes(displayScene, camera, { videos: videosConfig });
  }, [camera, displayScene, videosConfig]);

  if (!displayScene) {
    return null;
  }

  const [rx, ry, rz] = rotation;

  return (
    <primitive
      object={displayScene}
      position={new Vector3(...position)}
      rotation={new Euler(rx, ry, rz)}
      scale={scale}
      dispose={null}
    />
  );
}

function SceneBackground({
  textureUrl,
  blurriness,
  intensity
}: {
  textureUrl?: string | null;
  blurriness?: number;
  intensity?: number;
}) {
  const { scene, gl } = useThree();
  const fallbackColor = useMemo(() => new Color(DEFAULT_BACKGROUND), []);

  useEffect(() => {
    let disposed = false;
    let loadedTexture: Texture | null = null;
    const previousBlurriness = scene.backgroundBlurriness ?? 0;
    const previousIntensity = scene.backgroundIntensity ?? 1;
    const targetBlurriness = typeof blurriness === 'number' ? blurriness : 0;
    const targetIntensity = typeof intensity === 'number' ? intensity : 1;

    const applyFallback = () => {
      scene.background = fallbackColor;
    };

    applyFallback();
    scene.backgroundBlurriness = targetBlurriness;
    scene.backgroundIntensity = targetIntensity;

    if (!textureUrl) {
      return () => {
        if (scene.background === fallbackColor) {
          scene.background = null;
        }
        scene.backgroundBlurriness = previousBlurriness;
        scene.backgroundIntensity = previousIntensity;
      };
    }

    const loadBackground = async () => {
      try {
        let texture: Texture;
        const isKtx2 = textureUrl.toLowerCase().endsWith('.ktx2');
        if (isKtx2) {
          ensureKtx2Support(gl as WebGLRenderer);
          texture = await sharedKtx2Loader.loadAsync(textureUrl);
        } else {
          const loader = new TextureLoader();
          texture = await loader.loadAsync(textureUrl);
        }
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.mapping = EquirectangularReflectionMapping;
        if (!('isCompressedTexture' in texture && texture.isCompressedTexture)) {
          texture.magFilter = LinearFilter;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.generateMipmaps = true;
        }
        texture.needsUpdate = true;
        loadedTexture = texture;
        scene.background = texture;
        scene.backgroundBlurriness = targetBlurriness;
        scene.backgroundIntensity = targetIntensity;
      } catch (err) {
        if (!disposed) {
          console.warn('Failed to load background texture:', textureUrl, err);
          applyFallback();
        }
      }
    };

    loadBackground();

    return () => {
      disposed = true;
      if (loadedTexture) {
        if (scene.background === loadedTexture) {
          scene.background = null;
        }
        loadedTexture.dispose();
      } else if (scene.background === fallbackColor) {
        scene.background = null;
      }
      scene.backgroundBlurriness = previousBlurriness;
      scene.backgroundIntensity = previousIntensity;
    };
  }, [textureUrl, blurriness, intensity, scene, gl, fallbackColor]);

  return null;
}

function R3FViewerInner({ configUrl, onRequestSidebarClose }: R3FViewerProps) {
  const { config, loading, error } = useExhibitConfig(configUrl);

  const modelPath = config?.modelPath;
  const interactivesPath = config?.interactivesPath;
  const position = useMemo(() => coerceVector(config?.position), [config?.position]);
  const rotation = useMemo(() => coerceVector(config?.rotation), [config?.rotation]);
  const scale = typeof config?.scale === 'number' ? config.scale : 1;
  const rawParams = config?.params as Record<string, unknown> | undefined;
  const heightOffsetVector = useMemo(() => toVector3(rawParams?.heightOffset, [0, 1.05, 0]), [rawParams?.heightOffset]);
  const visitorEnterVector = useMemo(() => toVector3(rawParams?.visitorEnter, [0, 2, 0]), [rawParams?.visitorEnter]);
  const controllerParams = useMemo<ControllerParams | undefined>(() => {
    if (!rawParams) return undefined;
    const result: ControllerParams = {};
    if (typeof rawParams.visitorSpeed === 'number' && Number.isFinite(rawParams.visitorSpeed)) {
      result.visitorSpeed = rawParams.visitorSpeed;
    }
    if (typeof rawParams.gravity === 'number' && Number.isFinite(rawParams.gravity)) {
      result.gravity = rawParams.gravity;
    }
    if (typeof rawParams.rotateOrbit === 'number' && Number.isFinite(rawParams.rotateOrbit)) {
      result.rotateOrbit = rawParams.rotateOrbit;
    }
    if (rawParams.heightOffset !== undefined) {
      result.heightOffset = heightOffsetVector.clone();
    }
    if (rawParams.visitorEnter !== undefined) {
      result.visitorEnter = visitorEnterVector.clone();
    }
    return result;
  }, [rawParams, heightOffsetVector, visitorEnterVector]);
  const backgroundBlurriness = typeof rawParams?.backgroundBlurriness === 'number' ? rawParams.backgroundBlurriness : undefined;
  const backgroundIntensity = typeof rawParams?.backgroundIntensity === 'number' ? rawParams.backgroundIntensity : undefined;
  const lightIntensity = typeof rawParams?.lightIntensity === 'number' && Number.isFinite(rawParams.lightIntensity) ? rawParams.lightIntensity : 1;
  const [collider, setCollider] = useState<Mesh | null>(null);
  const [sceneVersion, bumpSceneVersion] = useReducer((value: number) => value + 1, 0);
  const [visitorInstance, setVisitorInstance] = useState<Visitor | null>(null);

  const linkMap = useMemo(() => {
    if (config?.links && typeof config.links === 'object') {
      return config.links as Record<string, unknown>;
    }
    return undefined;
  }, [config?.links]);

  const imagesMeta = useMemo(() => {
    if (config?.images && typeof config.images === 'object') {
      return config.images as Record<string, Record<string, unknown>>;
    }
    return undefined;
  }, [config?.images]);

  const videosMeta = useMemo(() => {
    if (!Array.isArray(config?.videos)) return undefined;
    const map: Record<string, Record<string, unknown>> = {};
    for (const entry of config.videos) {
      if (entry && typeof entry === 'object') {
        const id = (entry as Record<string, unknown>).id;
        if (typeof id === 'string') {
          map[id] = entry as Record<string, unknown>;
        }
      }
    }
    return map;
  }, [config?.videos]);

  const sculpturesMeta = useMemo(() => {
    if (config?.sculptures && typeof config.sculptures === 'object') {
      return config.sculptures as Record<string, Record<string, unknown>>;
    }
    return undefined;
  }, [config?.sculptures]);

  const legacyImages = useMemo<LegacyImageMap | undefined>(() => {
    if (!config?.images || typeof config.images !== 'object') {
      return undefined;
    }
    const result: LegacyImageMap = {};
    for (const [key, value] of Object.entries(config.images as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const record = value as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title : undefined;
      if (!title) continue;
      const author = typeof record.author === 'string' ? record.author : undefined;
      const description = typeof record.description === 'string' ? record.description : undefined;
      const imagePath = typeof record.imagePath === 'string' ? record.imagePath : undefined;
      const oracleImagePath = typeof record.oracleImagePath === 'string' ? record.oracleImagePath : undefined;
      const ipfsImagePath = typeof record.ipfsImagePath === 'string' ? record.ipfsImagePath : undefined;
      let img;
      if (record.img && typeof record.img === 'object') {
        const src = (record.img as Record<string, unknown>).src;
        if (typeof src === 'string') {
          img = { src };
        }
      }
      result[key] = {
        title,
        ...(author ? { author } : {}),
        ...(description ? { description } : {}),
        ...(imagePath ? { imagePath } : {}),
        ...(oracleImagePath ? { oracleImagePath } : {}),
        ...(ipfsImagePath ? { ipfsImagePath } : {}),
        ...(img ? { img } : {})
      };
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [config?.images]);

  const showLegacyModal = useLegacyModal(legacyImages);

  const [renderer, setRenderer] = useState<WebGLRenderer | null>(null);
  const [xrSupported, setXrSupported] = useState(false);
  const [xrSessionActive, setXrSessionActive] = useState(false);
  const [xrError, setXrError] = useState<string | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const handleCanvasCreated = useCallback((state: RootState) => {
    setRenderer(state.gl);
  }, []);

  const audioConfig = useMemo<AudioMeshConfig[] | undefined>(() => {
    if (!Array.isArray(config?.audio)) return undefined;
    const sanitized = config.audio
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === 'string'
          ? record.id
          : typeof record.name === 'string'
            ? record.name
            : undefined;
        if (!id) return null;
        const url = typeof record.url === 'string' ? record.url : undefined;
        const ipfsUrl = typeof record.ipfsUrl === 'string' ? record.ipfsUrl : undefined;
        if (!url && !ipfsUrl) return null;
        let directionalCone: [number, number, number] | undefined;
        if (Array.isArray(record.directionalCone)) {
          const cone = (record.directionalCone as unknown[])
            .slice(0, 3)
            .map((value) => (typeof value === 'number' ? value : Number(value)))
            .filter((value) => Number.isFinite(value)) as number[];
          if (cone.length === 3) {
            directionalCone = [cone[0], cone[1], cone[2]];
          }
        }
        const sanitized: AudioMeshConfig = {
          id,
          name: typeof record.name === 'string' ? record.name : undefined,
          url,
          ipfsUrl,
          loop: typeof record.loop === 'boolean' ? record.loop : undefined,
          refDistance: typeof record.refDistance === 'number' ? record.refDistance : undefined,
          rolloff: typeof record.rolloff === 'number' ? record.rolloff : undefined,
          maxDistance: typeof record.maxDistance === 'number' ? record.maxDistance : undefined,
          distanceModel: typeof record.distanceModel === 'string' ? record.distanceModel : undefined,
          volume: typeof record.volume === 'number' ? record.volume : undefined,
          directionalCone
        };
        return sanitized;
      })
      .filter((cfg): cfg is AudioMeshConfig => cfg !== null);
    return sanitized.length ? sanitized : undefined;
  }, [config?.audio]);

  const videosConfig = useMemo<VideoMeshConfig[] | undefined>(() => {
    if (!Array.isArray(config?.videos)) {
      return undefined;
    }
    const filtered: VideoMeshConfig[] = [];
    for (const entry of config.videos as Array<Record<string, unknown>>) {
      if (!entry || typeof entry !== 'object') continue;
      const id = typeof entry.id === 'string' ? entry.id : undefined;
      const rawSources = Array.isArray(entry.sources) ? entry.sources : [];
      if (!id || rawSources.length === 0) continue;
      const mappedSources: VideoMeshConfig['sources'] = [];
      for (const srcEntry of rawSources) {
        if (!srcEntry || typeof srcEntry !== 'object') continue;
        const record = srcEntry as Record<string, unknown>;
        const srcUrl = typeof record.src === 'string' ? record.src : undefined;
        if (!srcUrl) continue;
        const mapped = {
          src: srcUrl,
          type: typeof record.type === 'string' ? record.type : undefined,
          ipfsSrc: typeof record.ipfsSrc === 'string' ? record.ipfsSrc : undefined
        };
        mappedSources.push(mapped);
      }
      if (mappedSources.length === 0) continue;
      filtered.push({
        id,
        sources: mappedSources,
        loop: typeof entry.loop === 'boolean' ? entry.loop : undefined,
        muted: typeof entry.muted === 'boolean' ? entry.muted : undefined,
        preload: typeof entry.preload === 'string' ? entry.preload : undefined,
        poster:
          typeof entry.poster === 'string'
            ? entry.poster
            : typeof entry.oraclePoster === 'string'
              ? entry.oraclePoster
              : undefined,
        ipfsPoster: typeof entry.ipfsPoster === 'string' ? entry.ipfsPoster : undefined
      });
    }
    return filtered.length > 0 ? filtered : undefined;
  }, [config?.videos]);

  useEffect(() => {
    let cancelled = false;

    async function detectXrSupport() {
      if (typeof navigator === 'undefined') {
        if (!cancelled) {
          setXrSupported(false);
        }
        return;
      }
      const xrSystem = navigator.xr;
      if (!xrSystem?.isSessionSupported) {
        if (!cancelled) {
          setXrSupported(false);
        }
        return;
      }
      try {
        const supported = await xrSystem.isSessionSupported('immersive-vr');
        if (!cancelled) {
          setXrSupported(Boolean(supported));
          if (supported) {
            setXrError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setXrSupported(false);
          setXrError(err instanceof Error ? err.message : 'Unable to detect WebXR support.');
        }
      }
    }

    detectXrSupport();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!renderer) return;
    const xrManager = renderer.xr;
    const handleSessionStart = () => {
      setXrSessionActive(true);
      setXrError(null);
    };
    const handleSessionEnd = () => {
      setXrSessionActive(false);
      xrSessionRef.current = null;
    };
    xrManager.addEventListener('sessionstart', handleSessionStart);
    xrManager.addEventListener('sessionend', handleSessionEnd);
    return () => {
      xrManager.removeEventListener('sessionstart', handleSessionStart);
      xrManager.removeEventListener('sessionend', handleSessionEnd);
    };
  }, [renderer]);

  useEffect(() => {
    if (!renderer) return;
    renderer.xr.enabled = xrSupported;
    if (xrSupported) {
      renderer.xr.setReferenceSpaceType('local-floor');
    }
  }, [renderer, xrSupported]);

  useEffect(() => {
    return () => {
      const session = xrSessionRef.current;
      if (session && typeof session.end === 'function') {
        session.end().catch(() => undefined);
      }
      xrSessionRef.current = null;
    };
  }, []);

  const requestVrSession = useCallback(async () => {
    if (!renderer) return;
    if (typeof navigator === 'undefined') {
      setXrError('Navigator is not available in this environment.');
      return;
    }
    const xrSystem = navigator.xr;
    if (!xrSystem?.requestSession) {
      setXrError('WebXR is not available on this device.');
      return;
    }
    try {
      const session = await xrSystem.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor']
      });
      xrSessionRef.current = session;
      const handleEnd = () => {
        xrSessionRef.current = null;
        session.removeEventListener('end', handleEnd);
      };
      session.addEventListener('end', handleEnd);
      const restoreBinding = temporarilyDisableXRWebGLBinding(session);
      try {
        await renderer.xr.setSession(session);
      } finally {
        restoreBinding?.();
      }
      setXrError(null);
    } catch (err) {
      console.error('Failed to start VR session', err);
      setXrError(err instanceof Error ? err.message : 'Failed to start VR session.');
    }
  }, [renderer]);

  const exitVrSession = useCallback(async () => {
    if (!xrSessionRef.current) return;
    try {
      await xrSessionRef.current.end();
    } catch (err) {
      console.warn('Failed to end XR session', err);
    } finally {
      xrSessionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!modelPath) {
      setCollider(null);
    }
  }, [modelPath]);

  return (
    <div className="relative h-full w-full bg-gallery-dark">
      <Canvas
        shadows
        camera={{ position: [10, 6, -10], fov: 60, near: 0.1, far: 2000 }}
        dpr={typeof window !== 'undefined' ? [1, Math.min(2, window.devicePixelRatio || 1)] : [1, 2]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          logarithmicDepthBuffer: true,
          stencil: false
        }}
        onCreated={handleCanvasCreated}
      >
        <RendererTuning />
        <SceneBackground
          textureUrl={config?.backgroundTexture}
          blurriness={backgroundBlurriness}
          intensity={backgroundIntensity}
        />
        <ambientLight intensity={0.35 * lightIntensity} />
        <hemisphereLight args={[new Color('#dbe5ff'), new Color('#151515'), 0.4 * lightIntensity]} />


        <Suspense fallback={<Html center className="text-white">Loading exhibit…</Html>}>
          {modelPath ? (
            <ExhibitModel
              modelPath={modelPath}
              interactivesPath={interactivesPath}
              position={position}
              rotation={rotation}
              scale={scale}
              onColliderReady={setCollider}
              onSceneReady={bumpSceneVersion}
              videosConfig={videosConfig}
            />
          ) : (
            <Html center className="text-white">Missing modelPath in config</Html>
          )}
        </Suspense>

        {DEBUG_COLLIDER && collider ? <primitive object={collider} /> : null}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          enablePan={false}
          enableZoom={false}
          minDistance={1e-4}
          maxDistance={1e-4}
          maxPolarAngle={Math.PI}
        />
        <PointerInteractions
          visitor={visitorInstance}
          onCloseSidebar={onRequestSidebarClose}
          popupCallback={(payload) => {
            if (payload.type === 'Image') {
              showLegacyModal(payload.userData);
            }
          }}
          links={linkMap}
          imagesMeta={imagesMeta}
          videosMeta={videosMeta}
          sculpturesMeta={sculpturesMeta}
        />
        <FirstPersonController
          collider={collider}
          params={controllerParams}
          onVisitorReady={setVisitorInstance}
        />
        <AudioSystem audioConfig={audioConfig} ready={Boolean(collider)} sceneVersion={sceneVersion} />
        <AutoExposureControl params={rawParams} />
      </Canvas>
      <AudioPlayerControls />
      <Loader />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-white bg-black/40">
          Loading configuration…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-200 bg-black/60">
          Failed to load config: {error.message}
        </div>
      )}
      {xrSupported && (
        <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2 text-white text-center">
          <button
            type="button"
            className="rounded-lg border border-white/40 bg-slate-900/70 px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur-sm transition hover:bg-slate-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={xrSessionActive ? exitVrSession : requestVrSession}
            disabled={!renderer}
          >
            {xrSessionActive ? 'Exit VR' : 'Enter VR'}
          </button>
          {xrError ? (
            <p className="max-w-[16rem] rounded-md bg-red-900/70 px-3 py-1 text-xs text-red-100 shadow-lg">
              {xrError}
            </p>
          ) : (
            <p className="text-xs text-white/70">VR headset detected</p>
          )}
        </div>
      )}
    </div>
  );
}

export function R3FViewer(props: R3FViewerProps) {
  return (
    <MaterialModalProvider>
      <R3FViewerInner {...props} />
    </MaterialModalProvider>
  );
}

export default R3FViewer;

type ControllerParams = Partial<VisitorParams> & Record<string, unknown>;

function FirstPersonController({
  collider,
  params,
  onVisitorReady
}: {
  collider: Mesh | null;
  params?: ControllerParams;
  onVisitorReady?: (visitor: Visitor | null) => void;
}) {
  const { camera, gl, scene } = useThree();
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | undefined;

  const visitor = useMemo(() => {
    if (!controls) return null;
    const heightOffsetVec = toVector3(params?.heightOffset, [0, 1.05, 0]);
    const visitorEnterVec = toVector3(params?.visitorEnter, [0, 10, 0]);
    const defaults = {
      visitorSpeed: typeof params?.visitorSpeed === 'number' ? params.visitorSpeed : 2.5,
      gravity: typeof params?.gravity === 'number' ? params.gravity : -9,
      heightOffset: heightOffsetVec,
      rotateOrbit: typeof params?.rotateOrbit === 'number' ? params.rotateOrbit : 15,
      visitorEnter: visitorEnterVec
    };
    return new Visitor({
      camera,
      controls,
      params: defaults,
      renderer: gl,
      xrRig: null
    });
  }, [camera, controls, gl, params]);

  useEffect(() => {
    if (!visitor) return undefined;
    onVisitorReady?.(visitor);
    scene.add(visitor);
    visitor.reset?.();

    if (controls) {
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.minDistance = 1e-4;
      controls.maxDistance = 1e-4;

      const offset = toVector3(params?.heightOffset, [0, 1.05, 0]);
      const headPosition = visitor.position.clone().add(offset);
      controls.target.copy(headPosition);
      camera.position.copy(headPosition).add(new Vector3(0, 0, 1e-4));

      controls.update();
    }

    return () => {
      scene.remove(visitor);
      onVisitorReady?.(null);
    };
  }, [camera, controls, onVisitorReady, params, scene, visitor]);

  useEffect(() => {
    if (!visitor) return undefined;
    const updateRigReference = () => {
      const xrCamera = gl.xr.getCamera(camera);
      const rigObject = (xrCamera?.parent ?? xrCamera ?? null) as Object3D | null;
      visitor.xrRig = rigObject;
      if (rigObject) {
        const offset = toVector3(params?.heightOffset, [0, 1.05, 0]);
        const targetPosition = visitor.position.clone().add(offset);
        rigObject.position.copy(targetPosition);
      }
    };
    const handleSessionStart = () => {
      if (controls) {
        controls.enabled = false;
      }
      updateRigReference();
    };
    const handleSessionEnd = () => {
      visitor.xrRig = null;
      if (controls) {
        controls.enabled = true;
      }
    };

    gl.xr.addEventListener('sessionstart', handleSessionStart);
    gl.xr.addEventListener('sessionend', handleSessionEnd);

    return () => {
      gl.xr.removeEventListener('sessionstart', handleSessionStart);
      gl.xr.removeEventListener('sessionend', handleSessionEnd);
      visitor.xrRig = null;
      if (controls) {
        controls.enabled = true;
      }
    };
  }, [camera, controls, gl, params?.heightOffset, visitor]);

  useFrame((_, delta) => {
    if (!visitor || !collider) return;
    visitor.update(delta, collider);
  });

  return null;
}

function AudioSystem({
  audioConfig,
  ready,
  sceneVersion
}: {
  audioConfig: AudioMeshConfig[] | undefined;
  ready: boolean;
  sceneVersion: number;
}) {
  const { camera, controls: orbitControls, gl, scene } = useThree();
  const listener = useMemo(() => new AudioListener(), []);
  const controls = orbitControls as OrbitControlsImpl | undefined;
  const transform = useMemo(() => {
    const ctrl = new TransformControls(camera, gl.domElement);
    ctrl.enabled = false;
    ctrl.setSize(0.1);
    const helper = ctrl.getHelper?.();
    if (helper) {
      helper.visible = false;
    }
    return ctrl;
  }, [camera, gl]);
  const helper = useMemo(() => {
    return typeof transform.getHelper === 'function' ? transform.getHelper() : null;
  }, [transform]);

  useEffect(() => {
    camera.add(listener);
    return () => {
      camera.remove(listener);
    };
  }, [camera, listener]);

  useEffect(() => {
    if (!helper) return;
    helper.visible = false;
    if (helper.parent !== scene) {

      scene.add(helper);

    }
    return () => {
      transform.detach();
      if (helper.parent === scene) {
        scene.remove(helper);
      }
      transform.dispose?.();
    };
  }, [helper, scene, transform]);

  useEffect(() => {
    if (!controls) return;
    type DraggingChangedEvent = TransformControlsEventMap['dragging-changed'] & Event<'dragging-changed', TransformControls>;
    const handleDraggingChange = (event: DraggingChangedEvent) => {
      const isDragging = event.value === true;
      controls.enabled = !isDragging;
    };
    transform.addEventListener('dragging-changed', handleDraggingChange);
    return () => {
      transform.removeEventListener('dragging-changed', handleDraggingChange);
      controls.enabled = true;
    };
  }, [controls, transform]);

  useEffect(() => {
    if (!ready || !audioConfig || audioConfig.length === 0) {
      transform.detach();
      transform.enabled = false;
      if (helper) {
        helper.visible = false;
      }
      return;
    }

    transform.enabled = false;
    if (helper) {
      helper.visible = false;
    }

    return () => {
      transform.detach();
      transform.enabled = false;
      if (helper) {
        helper.visible = false;
      }
    };
  }, [audioConfig, ready, transform, helper]);

  if (!ready || !audioConfig || audioConfig.length === 0) {
    return null;
  }

  return (
    <AudioMeshes
      audioConfig={audioConfig}
      listener={listener}
      transform={transform}
      ready={ready}
      sceneVersion={sceneVersion}
    />
  );
}

function RendererTuning() {
  const { gl } = useThree();

  useEffect(() => {
    //gl.physicallyCorrectLights = true;
    gl.outputColorSpace = SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = PCFSoftShadowMap;
    if (typeof window !== 'undefined') {
      gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    }
  }, [gl]);

  return null;
}

function AutoExposureControl({ params }: { params?: Record<string, unknown> }) {
  const { gl, scene, camera } = useThree();
  const autoExposure = params?.autoExposure !== false;
  const targetGray = typeof params?.exposureTarget === 'number' ? params.exposureTarget : 0.5;
  const exposureMin = typeof params?.exposureMin === 'number' ? params.exposureMin : 0.5;
  const exposureMax = typeof params?.exposureMax === 'number' ? params.exposureMax : 2.5;
  const sampleInterval = typeof params?.exposureSampleInterval === 'number' ? Math.max(1, params.exposureSampleInterval) : 30;
  const sampleSize = 64;

  const targetRef = useMemo(() => ({ current: null as WebGLRenderTarget | null }), []);
  const bufferRef = useMemo(() => ({ current: null as Uint8Array | null }), []);
  const frameRef = useMemo(() => ({ current: 0 }), []);

  useEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
    if (typeof params?.exposure === 'number' && Number.isFinite(params.exposure)) {
      gl.toneMappingExposure = params.exposure;
    }
  }, [gl, params?.exposure]);

  useEffect(() => {
    if (!autoExposure) {
      targetRef.current?.dispose();
      targetRef.current = null;
      bufferRef.current = null;
      return;
    }
    const rt = new WebGLRenderTarget(sampleSize, sampleSize, { depthBuffer: false, stencilBuffer: false });
    targetRef.current = rt;
    bufferRef.current = new Uint8Array(sampleSize * sampleSize * 4);
    return () => {
      rt.dispose();
      targetRef.current = null;
      bufferRef.current = null;
    };
  }, [autoExposure, sampleSize, targetRef, bufferRef]);

  useFrame(() => {
    if (!autoExposure) return;
    const target = targetRef.current;
    const pixels = bufferRef.current;
    if (!target || !pixels) return;

    frameRef.current += 1;
    if (frameRef.current % sampleInterval !== 0) return;

    const prevRenderTarget = gl.getRenderTarget();
    try {
      gl.setRenderTarget(target);
      gl.render(scene, camera);
      gl.readRenderTargetPixels(target, 0, 0, sampleSize, sampleSize, pixels);
    } catch {
      // ignore sampling errors
    } finally {
      gl.setRenderTarget(prevRenderTarget);
    }

    let sum = 0;
    const inv255 = 1 / 255;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] * inv255;
      const g = pixels[i + 1] * inv255;
      const b = pixels[i + 2] * inv255;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const avg = sum / (sampleSize * sampleSize);
    if (!Number.isFinite(avg) || avg <= 0) return;

    const currentExposure = gl.toneMappingExposure ?? 1;
    const desired = currentExposure * Math.sqrt(Math.max(0.001, targetGray) / Math.max(0.001, Math.min(1, avg)));
    const clamped = Math.min(exposureMax, Math.max(exposureMin, desired));
    gl.toneMappingExposure = currentExposure + (clamped - currentExposure) * 0.15;
  });

  return null;
}
