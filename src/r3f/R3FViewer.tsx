import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html, Loader, OrbitControls } from '@react-three/drei';
import type { Vector3Tuple } from 'three';
import { BufferGeometry, Color, Euler, Vector3, Mesh, Group, Material, MeshBasicMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { StaticGeometryGenerator, MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import Visitor from '../modules/Visitor.js';
import { useExhibitConfig } from './useExhibitConfig';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VisitorParams } from '../modules/Visitor.js';
import { PointerInteractions, type PointerPopupPayload } from './PointerInteractions';
import { ImageModal } from './ImageModal';

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const DEBUG_COLLIDER = true;

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

  const [dracoLoader, ktx2Loader] = useMemo(() => {
    const draco = new DRACOLoader().setDecoderPath('/libs/draco/');
    const ktx2 = new KTX2Loader().setTranscoderPath('/libs/basis/');
    ktx2.detectSupport(gl);
    return [draco, ktx2] as const;
  }, [gl]);

  useEffect(() => {
    return () => {
      dracoLoader.dispose();
      ktx2Loader.dispose();
    };
  }, [dracoLoader, ktx2Loader]);

  const gltfResults = useLoader(
    GLTFLoader,
    paths,
    (loader: GLTFLoader) => {
      loader.setDRACOLoader(dracoLoader);
      loader.setKTX2Loader(ktx2Loader);
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
  onColliderReady
}: {
  modelPath: string;
  interactivesPath?: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  onColliderReady?: (collider: Mesh | null) => void;
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
  const position = coerceVector(config?.position);
  const rotation = coerceVector(config?.rotation);
  const scale = typeof config?.scale === 'number' ? config.scale : 1;
  const [collider, setCollider] = useState<Mesh | null>(null);
  const [visitorInstance, setVisitorInstance] = useState<Visitor | null>(null);
  const [modalEntry, setModalEntry] = useState<PointerPopupPayload | null>(null);

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
              setModalEntry(payload);
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
      {modalEntry && modalEntry.type === 'Image' ? (
        <ImageModal entry={modalEntry} onClose={() => setModalEntry(null)} />
      ) : null}
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
