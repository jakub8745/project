import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html, Loader, OrbitControls } from '@react-three/drei';
import type { Event, Vector3Tuple } from 'three';
import { AudioListener, BufferGeometry, Color, Euler, Vector3, Mesh, Group, Material, MeshBasicMaterial, WebGLRenderTarget, ACESFilmicToneMapping } from 'three';
import type { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
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
import { applyAudioMeshes, disposeAudioMeshes, type AudioMeshConfig } from '../modules/applyAudioMeshes.js';

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const DEBUG_COLLIDER = false;

let sharedDracoLoader: DRACOLoader | null = null;
let sharedKtx2Loader: KTX2Loader | null = null;
let sharedLoaderUsers = 0;
let ktx2SupportChecked = false;

function acquireSharedLoaders(renderer: WebGLRenderer) {
  sharedLoaderUsers += 1;
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader().setDecoderPath('/libs/draco/');
  }
  if (!sharedKtx2Loader) {
    sharedKtx2Loader = new KTX2Loader().setTranscoderPath('/libs/basis/');
  }
  if (!ktx2SupportChecked) {
    try {
      sharedKtx2Loader.detectSupport(renderer);
      ktx2SupportChecked = true;
    } catch (err) {
      console.warn('KTX2 detectSupport failed:', err);
    }
  }
  return {
    draco: sharedDracoLoader,
    ktx2: sharedKtx2Loader
  };
}

function releaseSharedLoaders() {
  sharedLoaderUsers = Math.max(0, sharedLoaderUsers - 1);
  if (sharedLoaderUsers === 0) {
    sharedDracoLoader?.dispose?.();
    sharedDracoLoader = null;
    sharedKtx2Loader?.dispose?.();
    sharedKtx2Loader = null;
    ktx2SupportChecked = false;
  }
}

interface R3FViewerProps {
  configUrl: string | null;
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
  videosConfig
}: {
  modelPath: string;
  interactivesPath?: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  onColliderReady?: (collider: Mesh | null) => void;
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
    return () => {
      onColliderReady?.(null);
      collider?.geometry?.dispose?.();
    };
  }, [collider, onColliderReady]);

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

export function R3FViewer({ configUrl }: R3FViewerProps) {
  const { config, loading, error } = useExhibitConfig(configUrl);

  const modelPath = config?.modelPath;
  const interactivesPath = config?.interactivesPath;
  const position = useMemo(() => coerceVector(config?.position), [config?.position]);
  const rotation = useMemo(() => coerceVector(config?.rotation), [config?.rotation]);
  const scale = typeof config?.scale === 'number' ? config.scale : 1;
  const [collider, setCollider] = useState<Mesh | null>(null);
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
        ...(img ? { img } : {})
      };
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [config?.images]);

  const showLegacyModal = useLegacyModal(legacyImages);

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
        preload: typeof entry.preload === 'string' ? entry.preload : undefined
      });
    }
    return filtered.length > 0 ? filtered : undefined;
  }, [config?.videos]);

  useEffect(() => {
    if (!modelPath) {
      setCollider(null);
    }
  }, [modelPath]);

  return (
    <div className="relative h-full w-full bg-gallery-dark">
      <Canvas shadows camera={{ position: [10, 6, -10], fov: 60 }}>
        <color attach="background" args={[new Color('#111827')]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />

        <Suspense fallback={<Html center className="text-white">Loading exhibit…</Html>}>
          {modelPath ? (
            <ExhibitModel
              modelPath={modelPath}
              interactivesPath={interactivesPath}
              position={position}
              rotation={rotation}
              scale={scale}
              onColliderReady={setCollider}
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
          params={config?.params as ControllerParams | undefined}
          onVisitorReady={setVisitorInstance}
        />
        <AudioSystem audioConfig={audioConfig} ready={Boolean(collider)} />
        <AutoExposureControl params={config?.params as Record<string, unknown> | undefined} />
      </Canvas>
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
    </div>
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
    const defaults = {
      visitorSpeed: params?.visitorSpeed ?? 2.5,
      gravity: params?.gravity ?? -9,
      heightOffset: params?.heightOffset ?? { x: 0, y: 1.05, z: 0 },
      rotateOrbit: params?.rotateOrbit ?? 15
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

      const offset = params?.heightOffset ?? { x: 0, y: 1.05, z: 0 };
      const headPosition = visitor.position.clone().add(new Vector3(offset.x, offset.y, offset.z));
      controls.target.copy(headPosition);
      camera.position.copy(headPosition).add(new Vector3(0, 0, 1e-4));

      controls.update();
    }

    return () => {
      scene.remove(visitor);
      onVisitorReady?.(null);
    };
  }, [camera, controls, onVisitorReady, params, scene, visitor]);

  useFrame((_, delta) => {
    if (!visitor || !collider) return;
    visitor.update(delta, collider);
  });

  return null;
}

function AudioSystem({ audioConfig, ready }: { audioConfig: AudioMeshConfig[] | undefined; ready: boolean }) {
  const { camera, controls: orbitControls, gl, scene } = useThree();
  const listener = useMemo(() => new AudioListener(), []);
  const controls = orbitControls as OrbitControlsImpl | undefined;
  const transform = useMemo(() => {
    const ctrl = new TransformControls(camera, gl.domElement);
    ctrl.enabled = false;
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
      disposeAudioMeshes();
      transform.detach();
      transform.enabled = false;
      if (helper) {
        helper.visible = false;
      }
      return;
    }
    applyAudioMeshes(scene, { audio: audioConfig }, listener, gl, camera, transform);
    return () => {
      disposeAudioMeshes();
      transform.detach();
      transform.enabled = false;
      if (helper) {
        helper.visible = false;
      }
    };
  }, [audioConfig, ready, scene, listener, gl, camera, transform, helper]);

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
