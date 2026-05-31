import { isIpfsUri, resolveOracleUrl } from '../../utils/ipfs';
import type { ExhibitConfig, UnknownRecord } from '../runtimeTypes';

export function normalizeMediaEntry(
  original: UnknownRecord | undefined,
  bucketId: string | undefined,
  key: string,
  oracleKey?: string
): UnknownRecord {
  const source: UnknownRecord = original ? { ...original } : {};
  const originalPath = source[key] as string | undefined;
  const isIpfs = isIpfsUri(originalPath);
  const oracleUrl = isIpfs && bucketId ? resolveOracleUrl(originalPath, bucketId) : undefined;
  const capitalisedKey = key.charAt(0).toUpperCase() + key.slice(1);
  const ipfsKey = `ipfs${capitalisedKey}`;

  return {
    ...source,
    [ipfsKey]: isIpfs ? originalPath : (source[ipfsKey] as string | undefined),
    ...(oracleKey ? { [oracleKey]: oracleUrl || (source[oracleKey] as string | undefined) } : {}),
    [key]: oracleUrl || originalPath
  };
}

export function normalizeConfig(config: ExhibitConfig & UnknownRecord): ExhibitConfig {
  const bucket = config.id as string | undefined;

  const images = config.images
    ? Object.fromEntries(
        Object.entries(config.images).map(([key, meta]) => {
          const withImage = normalizeMediaEntry(meta as UnknownRecord, bucket, 'imagePath', 'oracleImagePath');
          const normalised = normalizeMediaEntry(withImage, bucket, 'pdfPath', 'oraclePdfPath');
          return [key, normalised];
        })
      )
    : config.images;

  const videos = Array.isArray(config.videos)
    ? config.videos.map((vid) => {
        const videoRecord = vid as UnknownRecord & { sources?: unknown };
        const withPoster = normalizeMediaEntry(videoRecord, bucket, 'poster', 'oraclePoster');
        const sourcesValue = Array.isArray(videoRecord.sources)
          ? videoRecord.sources.map((src) => normalizeMediaEntry(src as UnknownRecord, bucket, 'src', 'oracleSrc'))
          : videoRecord.sources;
        return {
          ...withPoster,
          sources: sourcesValue
        };
      })
    : config.videos;

  const audio = Array.isArray(config.audio)
    ? config.audio.map((entry) => normalizeMediaEntry(entry as UnknownRecord, bucket, 'url', 'oracleUrl'))
    : config.audio;

  const normalisedModelPath = config.modelPath
    ? bucket && isIpfsUri(config.modelPath)
      ? resolveOracleUrl(config.modelPath, bucket)
      : config.modelPath
    : config.modelPath;
  const normalisedBackground = config.backgroundTexture
    ? bucket && isIpfsUri(config.backgroundTexture)
      ? resolveOracleUrl(config.backgroundTexture, bucket)
      : config.backgroundTexture
    : config.backgroundTexture;
  const normalisedEnvironment = config.environmentTexture
    ? bucket && isIpfsUri(config.environmentTexture)
      ? resolveOracleUrl(config.environmentTexture, bucket)
      : config.environmentTexture
    : config.environmentTexture;

  return {
    ...config,
    images,
    videos,
    audio,
    modelPath: normalisedModelPath,
    backgroundTexture: normalisedBackground,
    environmentTexture: normalisedEnvironment
  };
}
