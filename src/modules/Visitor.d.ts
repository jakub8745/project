import { Mesh, Vector2, Vector3, WebGLRenderer, Camera, Object3D } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface VisitorParams {
  visitorSpeed: number;
  gravity: number;
  heightOffset: { x: number; y: number; z: number };
  visitorEnter?: { x: number; y: number; z: number };
  rotateOrbit?: number;
  autoMoveSpeed?: number;
  movementAcceleration?: number;
  movementDeceleration?: number;
  spawnDirection?: string | [number, number, number] | { x: number; y: number; z: number };
  visitorDirection?: string | [number, number, number] | { x: number; y: number; z: number };
}

export interface VisitorDependencies {
  camera: Camera;
  controls: OrbitControls;
  params: VisitorParams;
  renderer: WebGLRenderer;
  xrRig?: Object3D | null;
  visitor?: Visitor;
}

export default class Visitor extends Mesh {
  constructor(deps: VisitorDependencies);
  visitorVelocity: Vector3;
  visitorIsOnGround: boolean;
  joystickVector: Vector2;
  params: VisitorParams;
  clickIndicator: Mesh | null;
  target: Vector3;
  isAutoMoving: boolean;
  reset(): void;
  update(delta: number, collider: Mesh): void;
  setJoystickInput(x?: number, y?: number): void;
}
