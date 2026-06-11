import { useMemo } from 'react';
import { resolveVideoPlaybackMode, type VideoPlaybackMode } from '../modules/videoPlaybackMode.js';
import type { ExhibitConfig } from './useExhibitConfig';
import { useLegacyModal, type LegacyImageMap } from './useLegacyModal';

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
      const imagePath = typeof record.imagePath === 'string' ? record.imagePath : undefined;
      const oracleImagePath = typeof record.oracleImagePath === 'string' ? record.oracleImagePath : undefined;
      const ipfsImagePath = typeof record.ipfsImagePath === 'string' ? record.ipfsImagePath : undefined;
      const pdfPath = typeof record.pdfPath === 'string' ? record.pdfPath : undefined;
      const pdfOpenPath = typeof record.pdfOpenPath === 'string' ? record.pdfOpenPath : undefined;
      const pdfOpenLabel = typeof record.pdfOpenLabel === 'string' ? record.pdfOpenLabel : undefined;
      const pdfExternalUrl = typeof record.pdfExternalUrl === 'string' ? record.pdfExternalUrl : undefined;
      const oraclePdfPath = typeof record.oraclePdfPath === 'string' ? record.oraclePdfPath : undefined;
      const ipfsPdfPath = typeof record.ipfsPdfPath === 'string' ? record.ipfsPdfPath : undefined;
      let img;
      if (record.img && typeof record.img === 'object') {
        const src = (record.img as Record<string, unknown>).src;
        if (typeof src === 'string') {
          img = { src };
        }
      }
      result[key] = {
        title,
        ...(author ? { author } : {}),
        ...(description ? { description } : {}),
        ...(imagePath ? { imagePath } : {}),
        ...(oracleImagePath ? { oracleImagePath } : {}),
        ...(ipfsImagePath ? { ipfsImagePath } : {}),
        ...(pdfPath ? { pdfPath } : {}),
        ...(pdfOpenPath ? { pdfOpenPath } : {}),
        ...(pdfOpenLabel ? { pdfOpenLabel } : {}),
        ...(pdfExternalUrl ? { pdfExternalUrl } : {}),
        ...(oraclePdfPath ? { oraclePdfPath } : {}),
        ...(ipfsPdfPath ? { ipfsPdfPath } : {}),
        ...(img ? { img } : {})
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
