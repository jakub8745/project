import { useEffect, useState } from 'react';
import { resolveOracleUrl, isIpfsUri } from '../utils/ipfs';

type UnknownRecord = Record<string, unknown>;

export interface ExhibitConfig extends UnknownRecord {
  id?: string;
  modelPath?: string;
  interactivesPath?: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  backgroundTexture?: string;
  images?: Record<string, UnknownRecord>;
  videos?: UnknownRecord[];
  audio?: UnknownRecord[];
}

interface UseExhibitConfigResult {
  config: ExhibitConfig | null;
  loading: boolean;
  error: Error | null;
}

function normalizeMediaEntry(
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

function normalizeConfig(config: ExhibitConfig & UnknownRecord): ExhibitConfig {
  const bucket = config.id as string | undefined;

  const images = config.images
    ? Object.fromEntries(
        Object.entries(config.images).map(([key, meta]) => {
          const normalised = normalizeMediaEntry(meta, bucket, 'imagePath', 'oracleImagePath');
          return [key, normalised];
        })
      )
    : config.images;

  const videos = Array.isArray(config.videos)
    ? config.videos.map((vid) => {
        const videoRecord = vid as UnknownRecord & { sources?: unknown };
        const sourcesValue = Array.isArray(videoRecord.sources)
          ? videoRecord.sources.map((src) => normalizeMediaEntry(src as UnknownRecord, bucket, 'src', 'oracleSrc'))
          : videoRecord.sources;
        return {
          ...videoRecord,
          sources: sourcesValue,
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
  const normalisedInteractivesPath = config.interactivesPath
    ? bucket && isIpfsUri(config.interactivesPath)
      ? resolveOracleUrl(config.interactivesPath, bucket)
      : config.interactivesPath
    : config.interactivesPath;
  const normalisedBackground = config.backgroundTexture
    ? bucket && isIpfsUri(config.backgroundTexture)
      ? resolveOracleUrl(config.backgroundTexture, bucket)
      : config.backgroundTexture
    : config.backgroundTexture;

  return {
    ...config,
    images,
    videos,
    audio,
    modelPath: normalisedModelPath,
    interactivesPath: normalisedInteractivesPath,
    backgroundTexture: normalisedBackground
  };
}

export function useExhibitConfig(configUrl: string | null): UseExhibitConfigResult {
  const [config, setConfig] = useState<ExhibitConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!configUrl) {
      setConfig(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(configUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load config ${response.status}: ${response.statusText}`);
        }
        const raw = (await response.json()) as ExhibitConfig & Record<string, unknown>;
        const normalised = normalizeConfig(raw);
        if (!cancelled) {
          setConfig(normalised);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        const errorObject = err instanceof Error ? err : new Error(String(err));
        if (!cancelled) {
          setError(errorObject);
          setConfig(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configUrl]);

  return { config, loading, error };
}
