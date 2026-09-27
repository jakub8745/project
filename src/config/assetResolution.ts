import { isIpfsUri } from '../utils/ipfs';

export interface RuntimeAssetSource {
  uri?: string;
  sourceUri?: string;
  ipfsUri?: string | null;
  fallbackUris?: string[];
  arweaveUri?: string | null;
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

/** Convert a declared URI to browser-loadable candidates without deriving an exhibit bucket or filename. */
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

  return [...new Set([...oracle, ...ipfs, ...archive, ...otherRemote, ...local])];
}

/** Global production source policy: configured Oracle, IPFS gateways, other declared remotes, then local/dev. */
export function resolveRuntimeAsset(asset: RuntimeAssetSource | undefined): string | undefined {
  return resolveRuntimeAssetCandidates(asset)[0];
}
