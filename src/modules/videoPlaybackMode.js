const VIDEO_PLAYBACK_MODES = ['direct_modal', 'spatial_video', 'synced_silent'];

export function normalizeVideoPlaybackMode(value) {
  if (typeof value !== 'string') return null;
  return VIDEO_PLAYBACK_MODES.includes(value) ? value : null;
}

export function resolveVideoPlaybackMode(config) {
  const explicit = normalizeVideoPlaybackMode(config?.playbackMode);
  if (explicit) return explicit;
  // Config-first fallback for legacy entries without explicit mode.
  return 'direct_modal';
}

export function isVideoMode(value) {
  return normalizeVideoPlaybackMode(value) !== null;
}
