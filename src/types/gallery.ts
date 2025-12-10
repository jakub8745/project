export interface VideoSource {
  src: string;
  type?: string;
}

export interface VideoMeta {
  id: string;
  loop?: boolean;
  muted?: boolean;
  playsinline?: boolean;
  preloadMode?: 'metadata' | 'auto' | 'canplay';
  poster?: string;
  ipfsPoster?: string;
  sources: VideoSource[];

  // runtime (set after preload in ModularGallery)
  videoEl?: HTMLVideoElement;
}
