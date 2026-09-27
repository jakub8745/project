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
const MODEL_SOURCE_TIMEOUT_MS = 20_000;

function installAssetFallbacks(loader: GLTFLoader, sourceMap: Map<string, string[]>) {
  loader.load = ((url, onLoad, onProgress, onError) => {
    const candidates = sourceMap.get(url) || [url];
    let candidateIndex = 0;
    let lastError: unknown;
    const startNext = async (): Promise<void> => {
      if (candidateIndex >= candidates.length) {
        onError?.(lastError instanceof Error ? lastError : new Error(`All configured model sources failed for ${url}`));
        return;
      }
      const candidate = candidates[candidateIndex++];
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), MODEL_SOURCE_TIMEOUT_MS);
      try {
        const response = await fetch(candidate, { signal: controller.signal });
        if (!response.ok) throw new Error(`Model source returned HTTP ${response.status}: ${candidate}`);
        const buffer = await response.arrayBuffer();
        const contentLength = Number(response.headers.get('content-length')) || buffer.byteLength;
        onProgress?.({ lengthComputable: true, loaded: buffer.byteLength, total: contentLength } as ProgressEvent);
        window.clearTimeout(timer);
        const resourcePath = new URL('.', new URL(candidate, window.location.href)).href;
        loader.parse(buffer, resourcePath, (value) => {
          if (candidate !== url) {
            console.info('[AssetLoader] Model fallback source loaded.', { url, selectedSource: candidate });
          }
          onLoad(value);
        }, (error) => {
          lastError = error;
          console.warn('[AssetLoader] Model source could not be decoded; trying the next configured source.', { url, candidate, error });
          void startNext();
        });
      } catch (error) {
        window.clearTimeout(timer);
        lastError = controller.signal.aborted
          ? new Error(`Model source timed out after ${MODEL_SOURCE_TIMEOUT_MS / 1000}s: ${candidate}`)
          : error;
        console.warn('[AssetLoader] Model source failed; trying the next configured source.', { url, candidate, error: lastError });
        await startNext();
      }
      window.clearTimeout(timer);
    };
    void startNext();
  }) as GLTFLoader['load'];
}

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

export function useConfiguredGLTFs(paths: string[], candidatesByPath: string[][] = []): GLTF[] {
  const gl = useThree((state) => state.gl);
  const loaders = useMemo(() => getSharedLoaders(gl), [gl]);
  const sourceMap = useMemo(() => {
    const result = new Map<string, string[]>();
    paths.forEach((path, index) => {
      const candidates = candidatesByPath[index] || [];
      result.set(path, [...new Set([path, ...candidates].filter((value) => typeof value === 'string' && value.trim()))]);
    });
    return result;
  }, [candidatesByPath, paths]);

  const gltfResults = useLoader(
    GLTFLoader,
    paths,
    (loader: GLTFLoader) => {
      loader.setDRACOLoader(loaders.draco!);
      loader.setKTX2Loader(loaders.ktx2!);
      loader.setMeshoptDecoder(MeshoptDecoder);
      installAssetFallbacks(loader, sourceMap);
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
