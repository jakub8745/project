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
  sources: VideoSource[];

  // runtime (set after preload in ModularGallery)
  videoEl?: HTMLVideoElement;
}
