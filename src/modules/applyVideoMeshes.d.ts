import type { Scene, Camera, Group } from 'three';

export interface VideoMeshConfig {
  id: string;
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
}

export interface GalleryVideoConfig {
  videos?: VideoMeshConfig[];
}

export function applyVideoMeshes(scene: Scene | Group, camera: Camera, galleryConfig: GalleryVideoConfig): void;
