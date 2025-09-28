import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html, Loader, OrbitControls } from '@react-three/drei';
import type { Vector3Tuple } from 'three';
import { BufferGeometry, Color, Euler, Vector3, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { StaticGeometryGenerator, MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import Visitor from '../modules/Visitor.js';
import { useExhibitConfig } from './useExhibitConfig';

(BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
(Mesh.prototype as any).raycast = acceleratedRaycast;

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

function useConfiguredGLTF(path: string) {
  const gl = useThree((state) => state.gl);

  const [gltf, cleanup] = useMemo(() => {
    const dracoLoader = new DRACOLoader().setDecoderPath('/libs/draco/');
    const ktx2Loader = new KTX2Loader().setTranscoderPath('/libs/basis/');
    ktx2Loader.detectSupport(gl);

    const gltfResult = useLoader(
      GLTFLoader,
      path,
      (loader: GLTFLoader) => {
        loader.setDRACOLoader(dracoLoader);
        loader.setKTX2Loader(ktx2Loader);
        loader.setMeshoptDecoder(MeshoptDecoder);
        return loader;
      }
    );

    const dispose = () => {
      dracoLoader.dispose();
      ktx2Loader.dispose();
    };

    return [gltfResult, dispose] as const;
  }, [gl, path]);

  useEffect(() => cleanup, [cleanup]);

  return gltf;
}

function ExhibitModel({
  modelPath,
  position,
  rotation,
  scale,
  onColliderReady
}: {
  modelPath: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  onColliderReady?: (collider: Mesh | null) => void;
}) {
  const gltf = useConfiguredGLTF(modelPath);

  const { displayScene, collider } = useMemo(() => {
    const display = gltf.scene.clone(true);
    display.traverse((node) => {
      if ('castShadow' in node) {

        node.castShadow = true;

        node.receiveShadow = true;
      }
    });

    const colliderSource = gltf.scene.clone(true);
    colliderSource.updateMatrixWorld(true);
    const staticGen = new StaticGeometryGenerator(colliderSource);
    staticGen.attributes = ['position', 'normal'];
    const merged = staticGen.generate();
    merged.boundsTree = new MeshBVH(merged);
    const colliderMesh = new Mesh(merged);
    colliderMesh.name = 'r3f-collider';
    colliderMesh.visible = false;

    return { displayScene: display, collider: colliderMesh };
  }, [gltf.scene]);

  useEffect(() => {
    onColliderReady?.(collider);
    return () => {
      onColliderReady?.(null);
      collider.geometry?.dispose?.();
    };
  }, [collider, onColliderReady]);

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
  const position = coerceVector(config?.position);
  const rotation = coerceVector(config?.rotation);
  const scale = typeof config?.scale === 'number' ? config.scale : 1;
  const [collider, setCollider] = useState<Mesh | null>(null);

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
              position={position}
              rotation={rotation}
              scale={scale}
              onColliderReady={setCollider}
            />
          ) : (
            <Html center className="text-white">Missing modelPath in config</Html>
          )}
        </Suspense>

        <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
        <FirstPersonController collider={collider} params={config?.params} />
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

function FirstPersonController({ collider, params }: { collider: Mesh | null; params?: any }) {
  const { camera, gl, scene } = useThree();
  const controls = useThree((state) => state.controls as any);

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
    scene.add(visitor);
    visitor.reset?.();
    return () => {
      scene.remove(visitor);
    };
  }, [scene, visitor]);

  useFrame((_, delta) => {
    if (!visitor || !collider) return;
    visitor.update(delta, collider);
  });

  return null;
}
