import type { Scene, Camera, Group } from 'three';
import type { VideoPlaybackMode } from './videoPlaybackMode.js';
import type { ObjectRegistry } from './objectRegistry.js';
import type { RuntimeAsset } from '../config/assetResolution';

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
    asset?: RuntimeAsset;
  }>;
  loop?: boolean;
  muted?: boolean;
  preload?: string;
  posterAsset?: RuntimeAsset;
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
  lifecycleId?: string;
}

export function setVideoScenePlaybackEnabled(enabled: boolean): void;
export function openVideoPlayerById(videoId: string): boolean;
export function playVideoById(videoId: string): boolean;
export function resumeVideoAudioById(videoId: string): boolean;
export function invokeVideoControlById(videoId: string, action: string, value?: unknown): boolean;
export function applyVideoMeshes(scene: Scene | Group, camera: Camera, galleryConfig: GalleryVideoConfig): void;
export function disposeAllVideoMeshes(): void;
export function disposeVideoMeshesForLifecycle(lifecycleId: string): void;
export function loadVideoPoster<T>(asset: RuntimeAsset, loadCandidate: (url: string) => Promise<T>): Promise<T>;
