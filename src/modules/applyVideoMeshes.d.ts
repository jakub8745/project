import type { Scene, Camera, Group } from 'three';

export interface VideoMeshConfig {
  id: string;
  videoSurface?: {
    roughness?: number;
    metalness?: number;
    envMapIntensity?: number;
    projection?: boolean;
    emissiveIntensity?: number;
    emissiveColor?: string;
  };
  sources: Array<{
    src: string;
    type?: string;
    ipfsSrc?: string;
  }>;
  loop?: boolean;
  muted?: boolean;
  preload?: string;
  poster?: string;
  ipfsPoster?: string;
  oraclePoster?: string;
  autoplayOnEnter?: boolean;
  syncStartGroup?: string;
  controls?: boolean;
  showLoader?: boolean;
  allowFullscreen?: boolean;
  interactive?: boolean;
  disableAudio?: boolean;
  volume?: number;
}

export interface GalleryVideoConfig {
  videos?: VideoMeshConfig[];
}

export function applyVideoMeshes(scene: Scene | Group, camera: Camera, galleryConfig: GalleryVideoConfig): void;
export function disposeAllVideoMeshes(): void;
