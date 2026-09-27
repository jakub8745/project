import { isIpfsUri } from '../../utils/ipfs';
import { resolveRuntimeAssetCandidates } from '../assetResolution';
import type { ExhibitConfig, UnknownRecord } from '../runtimeTypes';

export function normalizeMediaEntry(
  original: UnknownRecord | undefined,
  key: string,
  oracleKey?: string
): UnknownRecord {
  const source: UnknownRecord = original ? { ...original } : {};
  const originalPath = typeof source[key] === 'string' ? source[key] as string : undefined;
  const fallbackKeyByPath: Record<string, string> = {
    imagePath: 'imageFallbackPaths',
    pdfPath: 'pdfFallbackPaths',
    src: 'fallbackSrcs',
    url: 'fallbackUrls',
    poster: 'posterFallbackPaths'
  };
  const fallbackKey = fallbackKeyByPath[key] || `${key}Fallbacks`;
  const existingFallbacks = [
    ...(Array.isArray(source.fallbackUris) ? source.fallbackUris : []),
    ...(Array.isArray(source[fallbackKey]) ? source[fallbackKey] as unknown[] : [])
  ].filter((uri): uri is string => typeof uri === 'string');
  const candidates = resolveRuntimeAssetCandidates({
    sourceUri: originalPath,
    ipfsUri: isIpfsUri(originalPath) ? originalPath : undefined,
    fallbackUris: existingFallbacks
  });
  const capitalisedKey = key.charAt(0).toUpperCase() + key.slice(1);
  const ipfsKey = `ipfs${capitalisedKey}`;

  return {
    ...source,
    [ipfsKey]: isIpfsUri(originalPath) ? originalPath : source[ipfsKey],
    ...(oracleKey && source[oracleKey] ? { [oracleKey]: source[oracleKey] } : {}),
    [key]: candidates[0] || originalPath,
    [fallbackKey]: candidates.slice(1)
  };
}

export function normalizeConfig(config: ExhibitConfig & UnknownRecord): ExhibitConfig {
  const images = config.images
    ? Object.fromEntries(
        Object.entries(config.images).map(([key, meta]) => {
          const withImage = normalizeMediaEntry(meta as UnknownRecord, 'imagePath', 'oracleImagePath');
          const normalised = normalizeMediaEntry(withImage, 'pdfPath', 'oraclePdfPath');
          return [key, normalised];
        })
      )
    : config.images;

  const videos = Array.isArray(config.videos)
    ? config.videos.map((vid) => {
        const videoRecord = vid as UnknownRecord & { sources?: unknown };
        const withPoster = normalizeMediaEntry(videoRecord, 'poster', 'oraclePoster');
        const sourcesValue = Array.isArray(videoRecord.sources)
          ? videoRecord.sources.map((src) => normalizeMediaEntry(src as UnknownRecord, 'src', 'oracleSrc'))
          : videoRecord.sources;
        return { ...withPoster, sources: sourcesValue };
      })
    : config.videos;

  const audio = Array.isArray(config.audio)
    ? config.audio.map((entry) => normalizeMediaEntry(entry as UnknownRecord, 'url', 'oracleUrl'))
    : config.audio;

  const resolvePath = (path: string | undefined) =>
    path ? resolveRuntimeAssetCandidates({ sourceUri: path })[0] || path : path;
  const modelPath = resolvePath(config.modelPath);
  const backgroundTexture = resolvePath(config.backgroundTexture);
  const environmentTexture = resolvePath(config.environmentTexture);

  return {
    ...config,
    images,
    videos,
    audio,
    modelPath,
    modelPathCandidates: config.modelPathCandidates || (modelPath ? resolveRuntimeAssetCandidates({ sourceUri: config.modelPath }) : undefined),
    backgroundTexture,
    backgroundTextureCandidates: config.backgroundTextureCandidates || (backgroundTexture ? resolveRuntimeAssetCandidates({ sourceUri: config.backgroundTexture }) : undefined),
    environmentTexture,
    environmentTextureCandidates: config.environmentTextureCandidates || (environmentTexture ? resolveRuntimeAssetCandidates({ sourceUri: config.environmentTexture }) : undefined)
  };
}
