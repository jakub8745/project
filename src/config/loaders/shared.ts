import { compileRuntimeAsset, runtimeAssetCandidates, type RuntimeAsset } from '../assetResolution';
import type { ExhibitConfig, UnknownRecord } from '../runtimeTypes';

/** Compile viewer-profile URL fields into the shared RuntimeAsset contract. */
function normalizeMediaEntry(original: UnknownRecord | undefined, key: string, assetKey: string, fallbackKey: string, oracleKey: string, ipfsKey: string): UnknownRecord {
  const source: UnknownRecord = original ? { ...original } : {};
  const existing = source[assetKey] as RuntimeAsset | undefined;
  const primary = typeof source[key] === 'string' ? source[key] as string : undefined;
  const oracle = typeof source[oracleKey] === 'string' ? source[oracleKey] as string : undefined;
  const ipfs = typeof source[ipfsKey] === 'string' ? source[ipfsKey] as string : undefined;
  const fallbacks = Array.isArray(source[fallbackKey]) ? source[fallbackKey] as string[] : [];
  const alternateUris = Array.isArray(source.fallbackUris) ? source.fallbackUris as string[] : [];
  const asset = existing ?? compileRuntimeAsset({ sourceUri: primary, fallbackUris: [oracle, ...fallbacks, ...alternateUris].filter((url): url is string => typeof url === 'string'), ipfsUri: ipfs });
  delete source[fallbackKey];
  delete source[oracleKey];
  delete source[ipfsKey];
  delete source.fallbackUris;
  if (key !== 'src' && key !== 'url') delete source[key];
  return {
    ...source,
    [assetKey]: asset,
    ...((key === 'src' || key === 'url') ? { [key]: asset.candidates[0] ?? primary } : {})
  };
}

function normalizeSceneAsset(config: ExhibitConfig, pathKey: 'modelPath' | 'backgroundTexture' | 'environmentTexture', assetKey: 'modelAsset' | 'backgroundAsset' | 'environmentAsset'): UnknownRecord {
  const existing = config[assetKey] as RuntimeAsset | undefined;
  const path = config[pathKey];
  const asset = existing ?? compileRuntimeAsset({ sourceUri: path });
  return { [assetKey]: asset, [pathKey]: runtimeAssetCandidates(asset)[0] ?? path };
}

export function normalizeConfig(config: ExhibitConfig & UnknownRecord): ExhibitConfig {
  const base = { ...config };
  const images = config.images
    ? Object.fromEntries(Object.entries(config.images).map(([key, meta]) => {
        const image = normalizeMediaEntry(meta as UnknownRecord, 'imagePath', 'imageAsset', 'imageFallbackPaths', 'oracleImagePath', 'ipfsImagePath');
        return [key, normalizeMediaEntry(image, 'pdfPath', 'pdfAsset', 'pdfFallbackPaths', 'oraclePdfPath', 'ipfsPdfPath')];
      }))
    : config.images;
  const videos = Array.isArray(config.videos)
    ? config.videos.map((entry) => {
        const poster = normalizeMediaEntry(entry as UnknownRecord, 'poster', 'posterAsset', 'posterFallbackPaths', 'oraclePoster', 'ipfsPoster');
        const sources = Array.isArray(entry.sources)
          ? entry.sources.map((source) => normalizeMediaEntry(source as UnknownRecord, 'src', 'asset', 'fallbackSrcs', 'oracleSrc', 'ipfsSrc'))
          : entry.sources;
        return { ...poster, sources };
      })
    : config.videos;
  const audio = Array.isArray(config.audio)
    ? config.audio.map((entry) => normalizeMediaEntry(entry as UnknownRecord, 'url', 'asset', 'fallbackUrls', 'oracleUrl', 'ipfsUrl'))
    : config.audio;
  return {
    ...base,
    images,
    videos,
    audio,
    ...normalizeSceneAsset(config, 'modelPath', 'modelAsset'),
    ...normalizeSceneAsset(config, 'backgroundTexture', 'backgroundAsset'),
    ...normalizeSceneAsset(config, 'environmentTexture', 'environmentAsset')
  };
}
