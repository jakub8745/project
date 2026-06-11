import type { Vector3Tuple, Object3D } from 'three';

export type ProceduralPatternType = 'chevrons' | 'carpet' | 'silhouettes' | 'concrete' | 'plaster';

export type SurfacePrint = {
  id: number;
  text: string;
  surface: 'north' | 'south' | 'east' | 'west' | 'floor';
  u: number;
  v: number;
  rotation: number;
  scale: number;
  color: string;
  opacity: number;
};

export type ProceduralRoomSpec = Record<string, unknown> | undefined;

export type ProceduralRoomBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type ProceduralModelAnimationSpec = {
  swayAngle: number;
  swaySpeed: number;
  driftDistance: number;
  driftSpeed: number;
  bobDistance: number;
  bobSpeed: number;
  collisionAware: boolean;
  speed: number;
  boundaryPadding: number;
  turnJitter: number;
  direction: [number, number];
};

export type ProceduralModelSpec = {
  id?: string;
  path: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  collisionRadius: number;
  animation?: ProceduralModelAnimationSpec;
};

export type ProceduralObjectShape = 'sphere' | 'box' | 'torusKnot' | 'icosahedron' | 'blob';

export type ProceduralObjectMaterialSpec = {
  color: string;
  metalness: number;
  roughness: number;
  emissive: string;
  emissiveIntensity: number;
  envMapIntensity: number;
  texture?: string;
  textureRepeat: [number, number];
  transmission: number;
  thickness: number;
  ior: number;
  clearcoat: number;
  clearcoatRoughness: number;
  reflectivity: number;
  opacity: number;
  realtimeEnvMap: boolean;
  envMapResolution: number;
  envMapRefreshFrames: number;
};

export type ProceduralObjectAnimationSpec = ProceduralModelAnimationSpec;

export type ProceduralObjectSpec = {
  id?: string;
  shape: ProceduralObjectShape;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
  size: Vector3Tuple;
  radius: number;
  detail: number;
  tube: number;
  tubularSegments: number;
  radialSegments: number;
  p: number;
  q: number;
  blobAmplitude: number;
  blobFrequency: number;
  blobSpeed: number;
  collisionRadius: number;
  castShadow: boolean;
  receiveShadow: boolean;
  userData?: {
    type?: string;
    name?: string;
  };
  animation?: ProceduralObjectAnimationSpec;
  material: ProceduralObjectMaterialSpec;
};

export type ProceduralActorRefCallback = (id: string, object: Object3D | null, radius: number) => void;
