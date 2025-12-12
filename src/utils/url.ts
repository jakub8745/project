import { isIpfsUri } from './ipfs';

export function isAbsoluteUrl(url: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url);
}

export function normalizeConfigUrl(configUrl: string): string {
  const trimmed = configUrl.trim();
  if (!trimmed) return '';
  if (isAbsoluteUrl(trimmed) || trimmed.startsWith('//')) {
    return trimmed;
  }
  // ipfs:// should be treated as absolute even if caller did not prefix protocol (unlikely)
  if (isIpfsUri(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
