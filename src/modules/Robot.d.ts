import { Group, Mesh, Vector3 } from 'three';
import type Visitor from './Visitor';

export interface RobotObstacle {
  position: Vector3;
  radius?: number;
}

export interface RobotRoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RobotUpdateContext {
  collider?: Mesh | null;
  visitor?: Visitor | null;
  obstacles?: RobotObstacle[];
  roomBounds?: RobotRoomBounds | null;
}

export interface RobotParams {
  speed?: number;
  swayAngle?: number;
  swaySpeed?: number;
  bobDistance?: number;
  bobSpeed?: number;
  turnJitter?: number;
  lookAhead?: number;
  collisionRadius?: number;
  avoidDistance?: number;
  boundaryPadding?: number;
  direction?: [number, number];
  basePosition?: Vector3;
  baseRotation?: Vector3;
}

export default class Robot {
  name: string;
  constructor(params?: RobotParams);
  attach(target: Group | null): void;
  update(delta: number, context?: RobotUpdateContext): void;
}
