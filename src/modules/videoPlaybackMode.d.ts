export type VideoPlaybackMode = 'direct_modal' | 'spatial_video' | 'synced_silent';

export function normalizeVideoPlaybackMode(value: unknown): VideoPlaybackMode | null;
export function resolveVideoPlaybackMode(config: Record<string, unknown> | null | undefined): VideoPlaybackMode;
export function isVideoMode(value: unknown): value is VideoPlaybackMode;

