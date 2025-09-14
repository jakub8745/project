// src/modules/initRenderer.ts
import {
  WebGLRenderer,
  PCFSoftShadowMap,
  CineonToneMapping,
  SRGBColorSpace,
} from 'three';

import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

export default async function initRenderer(
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

  // Enable XR
  renderer.xr.enabled = true;

  // ✅ Append canvas first
  if (renderer.domElement && !container.contains(renderer.domElement)) {
    container.appendChild(renderer.domElement);
  }

  // ✅ Wait for XR feature detection before returning
  if (navigator.xr) {
    try {
      const supportsVR = await navigator.xr.isSessionSupported('immersive-vr');
      if (supportsVR) {
        container.appendChild(VRButton.createButton(renderer));
      }
    } catch (err) {
      console.warn('⚠️ XR session support check failed', err);
    }
  } else {
    console.warn('⚠️ WebXR not supported in this browser');
  }

  return renderer;
}
