import { Mesh, MeshStandardMaterial, Vector2, Vector3, WebGLRenderer, Group, Camera } from 'three';

export interface VisitorParams {
  visitorSpeed: number;
  gravity: number;
  heightOffset: { x: number; y: number; z: number };
  rotateOrbit?: number;
}

export interface VisitorDependencies {
  camera: Camera;
  controls: any;
  params: VisitorParams;
  renderer: WebGLRenderer;
  xrRig?: Group | null;
  visitor?: any;
}

export default class Visitor extends Mesh {
  constructor(deps: VisitorDependencies);
  visitorVelocity: Vector3;
  visitorIsOnGround: boolean;
  joystickVector: Vector2;
  reset(): void;
  update(delta: number, collider: Mesh): { changed: boolean; newFloor: any };
  setJoystickInput(x?: number, y?: number): void;
}
