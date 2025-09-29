import type { Scene, Camera, Renderer } from 'three';

export interface AudioMeshConfig {
  id: string;
  name?: string;
  url?: string;
  ipfsUrl?: string;
  loop?: boolean;
  refDistance?: number;
  rolloff?: number;
  maxDistance?: number;
  distanceModel?: string;
  volume?: number;
  directionalCone?: [number, number, number];
}

export interface GalleryAudioConfig {
  audio?: AudioMeshConfig[];
}

export function applyAudioMeshes(
  scene: Scene,
  galleryConfig: GalleryAudioConfig,
  listener: THREE.AudioListener,
  renderer: Renderer,
  camera: Camera,
  transform: unknown
): void;

export function disposeAudioMeshes(): void;
