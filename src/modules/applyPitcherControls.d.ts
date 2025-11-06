import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export function applyPitcherControls(
  obj: Object3D,
  scene: Scene,
  renderer: WebGLRenderer,
  camera: Camera,
  transform: TransformControls
): void;
