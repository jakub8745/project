// src/modules/initRenderer.ts
import {
  WebGLRenderer,
  PCFSoftShadowMap,
  CineonToneMapping,
  SRGBColorSpace,
} from 'three';

export default function initRenderer(
  container: HTMLElement = document.body
) {
  const renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = CineonToneMapping;
  renderer.toneMappingExposure = 1;

  container.appendChild(renderer.domElement);
  return renderer;
}
