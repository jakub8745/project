import { useEffect, useMemo } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import type { Mesh, Texture, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { getKtx2Loader } from '../loaders/ktx2Loader';

let sharedDracoLoader: DRACOLoader | null = null;
const ktx2SupportedRenderers = new WeakSet<WebGLRenderer>();
const modelLeases = new Map<string, { refs: number; gltf: GLTF; disposeTimer: number | null }>();

function disposeGltf(gltf: GLTF) {
  gltf.scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture === true) {
          (value as Texture).dispose();
        }
      }
      material.dispose();
    });
  });
}

function ensureKtx2Support(renderer: WebGLRenderer) {
  if (ktx2SupportedRenderers.has(renderer)) return;
  try {
    getKtx2Loader(renderer).detectSupport(renderer);
    ktx2SupportedRenderers.add(renderer);
  } catch (err) {
    console.warn('KTX2 detectSupport failed:', err);
  }
}

function getSharedLoaders(renderer: WebGLRenderer) {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader().setDecoderPath('/libs/draco/');
  }
  ensureKtx2Support(renderer);
  return {
    draco: sharedDracoLoader,
    ktx2: getKtx2Loader(renderer) as KTX2Loader
  };
}

export function useConfiguredGLTFs(paths: string[]): GLTF[] {
  const gl = useThree((state) => state.gl);
  const loaders = useMemo(() => getSharedLoaders(gl), [gl]);

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

  const results = useMemo(() => Array.isArray(gltfResults) ? gltfResults : [gltfResults], [gltfResults]);
  useEffect(() => {
    paths.forEach((path, index) => {
      const gltf = results[index];
      const entry = modelLeases.get(path) || { refs: 0, gltf, disposeTimer: null };
      if (entry.disposeTimer !== null) window.clearTimeout(entry.disposeTimer);
      entry.disposeTimer = null;
      entry.refs += 1;
      entry.gltf = gltf;
      modelLeases.set(path, entry);
    });
    return () => {
      paths.forEach((path) => {
        const entry = modelLeases.get(path);
        if (!entry) return;
        entry.refs = Math.max(0, entry.refs - 1);
        if (entry.refs > 0) return;
        entry.disposeTimer = window.setTimeout(() => {
          if (entry.refs > 0) return;
          clearConfiguredGLTF(path);
          disposeGltf(entry.gltf);
          modelLeases.delete(path);
        }, 0);
      });
    };
  }, [paths, results]);

  return results;
}

export function clearConfiguredGLTF(path: string): void {
  useLoader.clear(GLTFLoader, path);
}
