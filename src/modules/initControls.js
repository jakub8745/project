// src/modules/initControls.js
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function initControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.target.set(0, 5, 0);
  controls.maxPolarAngle = Math.PI;
  controls.minDistance = 1e-4;
  controls.maxDistance = 1e-4;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.02;
  controls.update();
  return controls;
}
