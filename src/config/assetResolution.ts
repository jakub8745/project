import { isIpfsUri } from '../utils/ipfs';

export interface RuntimeAssetSource {
  uri?: string;
  sourceUri?: string;
  ipfsUri?: string | null;
  fallbackUris?: string[];
  arweaveUri?: string | null;
}

/** The sole runtime delivery contract. Candidates are already ordered by the shared policy. */
export interface RuntimeAsset {
  candidates: string[];
}

export function compileRuntimeAsset(source: RuntimeAssetSource | undefined): RuntimeAsset {
  return { candidates: resolveRuntimeAssetCandidates(source) };
}

export function runtimeAssetCandidates(asset: RuntimeAsset | undefined): string[] {
  return asset?.candidates ?? [];
}

/** BPA-wide ordered IPFS gateways. Asset identity and canonical CIDs remain in each manifest. */
export const BPA_IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/'
] as const;
const ARWEAVE_GATEWAY = 'https://arweave.net/';

function isHttpUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

function isOracleObjectUri(uri: string): boolean {
  try {
    return new URL(uri).hostname.includes('.objectstorage.');
  } catch {
    return false;
  }
}

export function resolveIpfsUriCandidates(uri: string): string[] {
  if (!isIpfsUri(uri)) return [];
  const path = uri.slice('ipfs://'.length).replace(/^ipfs\//, '');
  if (!path) return [];
  return BPA_IPFS_GATEWAYS.map((gateway) => `${gateway}${path}`);
}

/** Convert declared locations to browser URLs: Oracle/cloud delivery, IPFS, archive, then local. */
export function resolveRuntimeAssetCandidates(asset: RuntimeAssetSource | undefined): string[] {
  if (!asset) return [];

  const declared = [asset.sourceUri, ...(asset.fallbackUris || []), asset.ipfsUri, asset.arweaveUri, asset.uri]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim());
  const oracle = declared.filter((uri) => isHttpUri(uri) && isOracleObjectUri(uri));
  const ipfs = declared.flatMap((uri) => resolveIpfsUriCandidates(uri));
  const archive = declared
    .filter((uri) => uri.startsWith('ar://'))
    .map((uri) => `${ARWEAVE_GATEWAY}${uri.slice('ar://'.length)}`);
  const otherRemote = declared.filter((uri) => isHttpUri(uri) && !isOracleObjectUri(uri));
  const local = declared.filter((uri) => !isHttpUri(uri) && !uri.startsWith('ipfs://') && !uri.startsWith('ar://'));

  return [...new Set([...oracle, ...otherRemote, ...ipfs, ...archive, ...local])];
}

/** Global production delivery policy shared by models, media, documents and textures. */
export function resolveRuntimeAsset(asset: RuntimeAssetSource | undefined): string | undefined {
  return resolveRuntimeAssetCandidates(asset)[0];
}

/** Load candidates in resolver order, stopping at the first successful source. */
export async function loadRuntimeAssetWithFallback<T>(
  candidates: string[],
  loadCandidate: (url: string) => Promise<T>,
  assetLabel = 'asset'
): Promise<T> {
  const usable = [...new Set(candidates.filter((url) => typeof url === 'string' && url.trim()))];
  if (usable.length === 0) throw new Error(`No usable sources configured for ${assetLabel}.`);

  const failures: Array<{ url: string; error: unknown }> = [];
  for (const url of usable) {
    try {
      return await loadCandidate(url);
    } catch (error) {
      failures.push({ url, error });
    }
  }

  const failedUrls = failures.map(({ url }) => url).join(', ');
  const error = new Error(`Unable to load ${assetLabel} from any configured source: ${failedUrls}`);
  Object.assign(error, { failures });
  throw error;
}
