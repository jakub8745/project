export function isAbsoluteUrl(url: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url);
}

export function normalizeConfigUrl(configUrl: string): string {
  const trimmed = configUrl.trim();
  if (!trimmed) return '';
  // ipfs:// should be treated as absolute.
  if (trimmed.startsWith('ipfs://')) {
    return trimmed;
  }
  if (isAbsoluteUrl(trimmed) || trimmed.startsWith('//')) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function toSafeExternalUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const resolved = new URL(rawUrl, base);
    if (!SAFE_PROTOCOLS.has(resolved.protocol)) {
      return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}
