// src/modules/initControls.js
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

/**
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement
 * @param {{ onChange?: () => void }} [opts]
 * @returns {{ orbit: OrbitControls, transform: TransformControls }}
 */
export default function initControls(camera, domElement, opts = {}) {
  const { onChange } = opts;

  const orbit = new OrbitControls(camera, domElement);
  orbit.target.set(0, 5, 0);
  orbit.maxPolarAngle = Math.PI;
  orbit.minDistance = 1e-4; // note: equals maxDistance => zoom locked
  orbit.maxDistance = 1e-4;
  orbit.autoRotate = false;
  orbit.autoRotateSpeed = 0.02;
  orbit.update();

  const transform = new TransformControls(camera, domElement);

  // Toggle OrbitControls while dragging gizmo
  transform.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    
  });



  // Optional render callback
  if (typeof onChange === 'function') {
    transform.addEventListener('change', onChange);
  }

  // Return *both* controls
  return { orbit, transform };
}




