import { useMemo } from 'react';
import { resolveVideoPlaybackMode, type VideoPlaybackMode } from '../modules/videoPlaybackMode.js';
import type { ExhibitConfig } from './useExhibitConfig';
import { useLegacyModal, type LegacyImageMap } from './useLegacyModal';
import type { RuntimeAsset } from '../config/assetResolution';

export function useSceneInteractionMetadata(config: ExhibitConfig | null) {
  const linkMap = useMemo(() => {
    if (config?.links && typeof config.links === 'object') {
      return config.links as Record<string, unknown>;
    }
    return undefined;
  }, [config?.links]);

  const imagesMeta = useMemo(() => {
    if (config?.images && typeof config.images === 'object') {
      return config.images as Record<string, Record<string, unknown>>;
    }
    return undefined;
  }, [config?.images]);

  const videosMeta = useMemo(() => {
    if (!Array.isArray(config?.videos)) return undefined;
    const map: Record<string, Record<string, unknown>> = {};
    for (const entry of config.videos) {
      if (entry && typeof entry === 'object') {
        const id = (entry as Record<string, unknown>).id;
        if (typeof id === 'string') {
          map[id] = entry as Record<string, unknown>;
        }
      }
    }
    return map;
  }, [config?.videos]);

  const videosInteraction = useMemo<Record<string, { interactive?: boolean; playbackMode?: VideoPlaybackMode }> | undefined>(() => {
    if (!Array.isArray(config?.videos)) return undefined;
    const map: Record<string, { interactive?: boolean; playbackMode?: VideoPlaybackMode }> = {};
    for (const entry of config.videos) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : undefined;
      if (!id) continue;
      map[id] = {
        interactive: typeof record.interactive === 'boolean' ? record.interactive : undefined,
        playbackMode: resolveVideoPlaybackMode(record)
      };
    }
    return map;
  }, [config?.videos]);

  const sculpturesMeta = useMemo(() => {
    if (config?.sculptures && typeof config.sculptures === 'object') {
      return config.sculptures as Record<string, Record<string, unknown>>;
    }
    return undefined;
  }, [config?.sculptures]);

  const legacyImages = useMemo<LegacyImageMap | undefined>(() => {
    if (!config?.images || typeof config.images !== 'object') {
      return undefined;
    }
    const result: LegacyImageMap = {};
    for (const [key, value] of Object.entries(config.images as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const record = value as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title : undefined;
      if (!title) continue;
      const author = typeof record.author === 'string' ? record.author : undefined;
      const description = typeof record.description === 'string' ? record.description : undefined;
      const imageAsset = record.imageAsset as RuntimeAsset | undefined;
      const pdfAsset = record.pdfAsset as RuntimeAsset | undefined;
      const pdfOpenPath = typeof record.pdfOpenPath === 'string' ? record.pdfOpenPath : undefined;
      const pdfOpenLabel = typeof record.pdfOpenLabel === 'string' ? record.pdfOpenLabel : undefined;
      const pdfExternalUrl = typeof record.pdfExternalUrl === 'string' ? record.pdfExternalUrl : undefined;
      result[key] = {
        title,
        ...(author ? { author } : {}),
        ...(description ? { description } : {}),
        ...(imageAsset ? { imageAsset } : {}),
        ...(pdfAsset ? { pdfAsset } : {}),
        ...(pdfOpenPath ? { pdfOpenPath } : {}),
        ...(pdfOpenLabel ? { pdfOpenLabel } : {}),
        ...(pdfExternalUrl ? { pdfExternalUrl } : {}),
      };
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [config?.images]);

  const showLegacyModal = useLegacyModal(legacyImages);

  return {
    linkMap,
    imagesMeta,
    videosMeta,
    videosInteraction,
    sculpturesMeta,
    showLegacyModal
  };
}
