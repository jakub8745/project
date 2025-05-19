import { Spherical, MathUtils, Vector3 } from 'three';

/**
 * Rotate the camera around its target by a specified angle.
 * @param {THREE.Camera} camera - The camera to rotate.
 * @param {THREE.OrbitControls} controls - The OrbitControls instance associated with the camera.
 * @param {number} angleDegrees - Angle in degrees to rotate the camera around its target (positive is clockwise).
 */
export default function rotateOrbit(camera, controls, angleDegrees) {
  // Convert degrees to radians
  const angleRadians = MathUtils.degToRad(angleDegrees);

  // Compute offset vector from controls.target
  const offset = camera.position.clone().sub(controls.target);

  // Convert to spherical coords, adjust theta, convert back
  const spherical = new Spherical().setFromVector3(offset);
  spherical.theta += angleRadians;
  const newOffset = new Vector3().setFromSpherical(spherical);

  // Apply new position and update orientation
  camera.position.copy(controls.target).add(newOffset);
  camera.lookAt(controls.target);

  // Sync controls
  controls.update();
}
