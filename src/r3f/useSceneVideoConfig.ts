import { useMemo } from 'react';
import { type VideoMeshConfig } from '../modules/applyVideoMeshes.js';
import { resolveVideoPlaybackMode } from '../modules/videoPlaybackMode.js';
import type { ExhibitConfig } from './useExhibitConfig';

export function parseSceneVideoConfig(config: ExhibitConfig | null): VideoMeshConfig[] | undefined {
    if (!Array.isArray(config?.videos)) {
      return undefined;
    }
    const filtered: VideoMeshConfig[] = [];
    for (const entry of config.videos as Array<Record<string, unknown>>) {
      if (!entry || typeof entry !== 'object') continue;
      const id = typeof entry.id === 'string' ? entry.id : undefined;
      const rawSources = Array.isArray(entry.sources) ? entry.sources : [];
      if (!id || rawSources.length === 0) continue;
      const mappedSources: VideoMeshConfig['sources'] = [];
      for (const srcEntry of rawSources) {
        if (!srcEntry || typeof srcEntry !== 'object') continue;
        const record = srcEntry as Record<string, unknown>;
        const srcUrl = typeof record.src === 'string' ? record.src : undefined;
        if (!srcUrl) continue;
        const mapped = {
          src: srcUrl,
          type: typeof record.type === 'string' ? record.type : undefined,
          ipfsSrc: typeof record.ipfsSrc === 'string' ? record.ipfsSrc : undefined
        };
        mappedSources.push(mapped);
      }
      if (mappedSources.length === 0) continue;
      const surfaceRecord =
        entry.videoSurface && typeof entry.videoSurface === 'object'
          ? entry.videoSurface as Record<string, unknown>
          : null;
      filtered.push({
        id,
        sources: mappedSources,
        videoSurface: surfaceRecord
          ? {
              roughness: typeof surfaceRecord.roughness === 'number' ? surfaceRecord.roughness : undefined,
              metalness: typeof surfaceRecord.metalness === 'number' ? surfaceRecord.metalness : undefined,
              envMapIntensity:
                typeof surfaceRecord.envMapIntensity === 'number' ? surfaceRecord.envMapIntensity : undefined,
              projection: surfaceRecord.projection === true,
              emissiveIntensity:
                typeof surfaceRecord.emissiveIntensity === 'number' ? surfaceRecord.emissiveIntensity : undefined,
              emissiveColor:
                typeof surfaceRecord.emissiveColor === 'string' ? surfaceRecord.emissiveColor : undefined
            }
          : undefined,
        loop: typeof entry.loop === 'boolean' ? entry.loop : undefined,
        muted: typeof entry.muted === 'boolean' ? entry.muted : undefined,
        autoplayOnEnter: typeof entry.autoplayOnEnter === 'boolean' ? entry.autoplayOnEnter : undefined,
        syncStartGroup: typeof entry.syncStartGroup === 'string' ? entry.syncStartGroup : undefined,
        controls: typeof entry.controls === 'boolean' ? entry.controls : undefined,
        allowFullscreen: typeof entry.allowFullscreen === 'boolean' ? entry.allowFullscreen : undefined,
        interactive: typeof entry.interactive === 'boolean' ? entry.interactive : undefined,
        controlsAnchorName: typeof entry.controlsAnchorName === 'string' ? entry.controlsAnchorName : undefined,
        disableAudio: typeof entry.disableAudio === 'boolean' ? entry.disableAudio : undefined,
        spatialAudio: typeof entry.spatialAudio === 'boolean' ? entry.spatialAudio : undefined,
        deferLoadUntilPlay: typeof entry.deferLoadUntilPlay === 'boolean' ? entry.deferLoadUntilPlay : undefined,
        playbackMode: resolveVideoPlaybackMode(entry),
        volume: typeof entry.volume === 'number' ? entry.volume : undefined,
        preload: typeof entry.preload === 'string' ? entry.preload : undefined,
        poster:
          typeof entry.poster === 'string'
            ? entry.poster
            : typeof entry.oraclePoster === 'string'
              ? entry.oraclePoster
              : undefined,
        ipfsPoster: typeof entry.ipfsPoster === 'string' ? entry.ipfsPoster : undefined
      });
    }
    return filtered.length > 0 ? filtered : undefined;
}

export function useSceneVideoConfig(config: ExhibitConfig | null): VideoMeshConfig[] | undefined {
  return useMemo(() => parseSceneVideoConfig(config), [config]);
}
