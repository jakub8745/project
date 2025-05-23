// src/modules/initCamera.js
import { PerspectiveCamera } from 'three';

export default function initCamera() {
  const camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(10, 6, -10);
  camera.updateProjectionMatrix();

  return camera;
}
