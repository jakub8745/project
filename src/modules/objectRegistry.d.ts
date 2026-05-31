import type { Object3D } from 'three';

export type ObjectCategory =
  | 'audio'
  | 'enter'
  | 'floor'
  | 'image'
  | 'link'
  | 'pitcher'
  | 'room'
  | 'sculpture'
  | 'video'
  | 'videoControl'
  | 'visitorLocation'
  | 'wall'
  | 'walls'
  | string;

export interface ObjectRegistryEntry extends Record<string, unknown> {
  objectName?: string;
  object?: string;
  node?: string;
  id?: string;
  ref?: string;
  target?: string;
  mediaId?: string;
  configId?: string;
  elementID?: string;
  category?: ObjectCategory;
  type?: string;
  role?: string;
  kind?: string;
  visible?: boolean;
  interactive?: boolean;
  forwardAxis?: string | [number, number, number] | { x?: number; y?: number; z?: number };
  lookAxis?: string | [number, number, number] | { x?: number; y?: number; z?: number };
  directionAxis?: string | [number, number, number] | { x?: number; y?: number; z?: number };
  direction?: string | [number, number, number] | { x?: number; y?: number; z?: number };
  spawnDirection?: string | [number, number, number] | { x?: number; y?: number; z?: number };
  lookDirection?: string | [number, number, number] | { x?: number; y?: number; z?: number };
  worldDirection?: string | [number, number, number] | { x?: number; y?: number; z?: number };
  holdRotate?: boolean;
  holdRotation?: boolean;
  holdRotateSpeed?: number;
  transformControls?: boolean | {
    mode?: 'translate' | 'rotate' | 'scale';
    size?: number;
    hover?: boolean;
    light?: {
      enabled?: boolean;
      color?: string | number;
      intensity?: number;
      yOffset?: number;
      angle?: number;
      penumbra?: number;
      decay?: number;
      distance?: number;
      castShadow?: boolean;
      shadowMapSize?: number;
      shadowBias?: number;
      shadowNormalBias?: number;
      shadowRadius?: number;
      shadowCameraNear?: number;
      shadowCameraFar?: number;
    };
  };
  interactions?: {
    holdRotate?: boolean;
    holdRotation?: boolean;
    holdRotateSpeed?: number;
    transformControls?: boolean | ObjectRegistryEntry['transformControls'];
    gizmo?: boolean | ObjectRegistryEntry['transformControls'];
    [key: string]: unknown;
  };
}

export type ObjectRegistry = Map<string, ObjectRegistryEntry>;
export type RawObjectRegistry =
  | Record<string, ObjectRegistryEntry | string>
  | { objects?: Record<string, ObjectRegistryEntry | string> }
  | ObjectRegistryEntry[];

export interface ObjectRuntimeData {
  category?: ObjectCategory;
  type?: string;
  ref?: string;
  name?: string;
  entry?: ObjectRegistryEntry;
  source: 'config' | 'legacy';
}

export function normalizeObjectRegistry(rawRegistry: unknown): ObjectRegistry | undefined;
export function resolveObjectRuntimeData(object: Object3D, registry?: ObjectRegistry): ObjectRuntimeData | null;
export function applyObjectRuntimeData(object: Object3D, registry?: ObjectRegistry): ObjectRuntimeData | null;
