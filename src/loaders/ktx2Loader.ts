import type { WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const loaderCache = new WeakMap<WebGLRenderer, KTX2Loader>();

export function getKtx2Loader(renderer?: WebGLRenderer): KTX2Loader {
  if (!renderer) {
    return new KTX2Loader().setTranscoderPath('/libs/basis/');
  }
  const cached = loaderCache.get(renderer);
  if (cached) return cached;
  const loader = new KTX2Loader().setTranscoderPath('/libs/basis/');
  loaderCache.set(renderer, loader);
  return loader;
}
