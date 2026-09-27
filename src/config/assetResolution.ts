import { isIpfsUri, resolveOracleUrl } from '../utils/ipfs';

export interface RuntimeAssetSource {
  uri?: string;
  sourceUri?: string;
  ipfsUri?: string | null;
  fallbackUris?: string[];
}

/**
 * Resolve a runtime asset using the v3 deployment policy:
 * explicit Oracle/remote URLs first, then configured remote fallbacks, then
 * local source files, with canonical IPFS retained as the final fallback.
 */
export function resolveRuntimeAsset(asset: RuntimeAssetSource | undefined, bucket?: string): string | undefined {
  if (!asset) return undefined;
  const source = asset.sourceUri?.trim();
  const canonical = asset.ipfsUri?.trim() || asset.uri?.trim();
  const fallbacks = asset.fallbackUris?.filter((uri) => typeof uri === 'string' && uri.trim()).map((uri) => uri.trim()) || [];
  const remoteSource = source && /^https?:\/\//i.test(source) ? source : undefined;
  const remoteFallback = fallbacks.find((uri) => /^https?:\/\//i.test(uri));
  if (remoteSource) return remoteSource;
  if (remoteFallback) return remoteFallback;
  if (source && !isIpfsUri(source)) return source;
  if (isIpfsUri(canonical)) return bucket ? resolveOracleUrl(canonical, bucket) : canonical;
  return canonical || fallbacks[0];
}
