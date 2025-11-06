import { Mesh, Vector2, Vector3, WebGLRenderer, Group, Camera, Object3D } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface VisitorParams {
  visitorSpeed: number;
  gravity: number;
  heightOffset: { x: number; y: number; z: number };
  rotateOrbit?: number;
}

export interface VisitorDependencies {
  camera: Camera;
  controls: OrbitControls;
  params: VisitorParams;
  renderer: WebGLRenderer;
  xrRig?: Group | null;
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
  update(delta: number, collider: Mesh): { changed: boolean; newFloor: Object3D | null };
  setJoystickInput(x?: number, y?: number): void;
}
