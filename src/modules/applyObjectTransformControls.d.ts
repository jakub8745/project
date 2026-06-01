import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export interface ObjectTransformControlOptions {
  mode?: 'translate' | 'rotate' | 'scale';
  rotateMode?: 'free' | 'axis';
  size?: number;
  sizeMode?: 'world' | 'screen';
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
}

export function applyObjectTransformControls(
  obj: Object3D,
  scene: Scene,
  renderer: WebGLRenderer,
  camera: Camera,
  transform: TransformControls,
  options?: ObjectTransformControlOptions
): (() => void) | null;
