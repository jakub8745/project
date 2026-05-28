// Backward-compatible wrapper for older Pitcher objects.
import { applyObjectTransformControls } from './applyObjectTransformControls.js';

export function applyPitcherControls(obj, scene, renderer, camera, transform, options = {}) {
  return applyObjectTransformControls(obj, scene, renderer, camera, transform, {
    mode: 'rotate',
    size: 0.3,
    hover: true,
    light: {
      enabled: true,
      color: 0xffffff,
      intensity: 40,
      yOffset: 3,
      angle: Math.PI / 7,
      penumbra: 0.3,
      decay: 2,
      distance: 35,
      castShadow: true,
      shadowMapSize: 2048,
      shadowBias: 0,
      shadowNormalBias: 0.02,
      shadowRadius: 2,
      shadowCameraNear: 0.5,
      shadowCameraFar: 40
    },
    ...options
  });
}
