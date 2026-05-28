import type { Scene, Camera, Group } from 'three';
import type { VideoPlaybackMode } from './videoPlaybackMode.js';
import type { ObjectRegistry } from './objectRegistry.js';

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
  allowFullscreen?: boolean;
  htmlOverlayControls?: boolean;
  interactive?: boolean;
  controlsAnchorName?: string;
  disableAudio?: boolean;
  spatialAudio?: boolean;
  deferLoadUntilPlay?: boolean;
  playbackMode?: VideoPlaybackMode;
  volume?: number;
}

export interface GalleryVideoConfig {
  videos?: VideoMeshConfig[];
  objectRegistry?: ObjectRegistry;
}

export function setVideoScenePlaybackEnabled(enabled: boolean): void;
export function applyVideoMeshes(scene: Scene | Group, camera: Camera, galleryConfig: GalleryVideoConfig): void;
export function disposeAllVideoMeshes(): void;
