import { isIpfsUri, resolveOracleUrl } from '../utils/ipfs';

export interface RuntimeAssetSource {
  uri?: string;
  fallbackUris?: string[];
}

/** Preserve explicit locations; only legacy IPFS assets without fallbacks infer a bucket. */
export function resolveRuntimeAsset(asset: RuntimeAssetSource | undefined, bucket?: string): string | undefined {
  if (!asset) return undefined;
  const fallback = asset.fallbackUris?.find((uri) => typeof uri === 'string' && uri.trim())?.trim();
  if (isIpfsUri(asset.uri)) return fallback || (bucket ? resolveOracleUrl(asset.uri, bucket) : asset.uri);
  return asset.uri || fallback;
}
