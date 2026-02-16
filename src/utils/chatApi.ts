const EXPLICIT_CHAT_API_BASE = (import.meta.env.VITE_CHAT_API_BASE || '').trim().replace(/\/+$/, '');
const FALLBACK_CHAT_API_BASE = (import.meta.env.VITE_CHAT_API_FALLBACK || '').trim().replace(/\/+$/, '');
const DEFAULT_IPFS_CHAT_API_BASE = 'https://blob-room-api.henrybolecki.workers.dev';

function resolveChatApiBase(): string {
  if (EXPLICIT_CHAT_API_BASE) return EXPLICIT_CHAT_API_BASE;
  if (FALLBACK_CHAT_API_BASE) return FALLBACK_CHAT_API_BASE;
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname;
  if (path.startsWith('/ipns/') || path.startsWith('/ipfs/')) {
    return DEFAULT_IPFS_CHAT_API_BASE;
  }
  return '';
}

const CHAT_API_BASE = resolveChatApiBase();

export function chatApiUrl(path: string): string {
  if (!CHAT_API_BASE) return path;
  return `${CHAT_API_BASE}${path}`;
}

