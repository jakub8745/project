import { normalizeConfigUrl } from '../utils/url';

interface Entry {
  controller: AbortController;
  promise: Promise<unknown>;
  readers: number;
  settled: boolean;
}
const entries = new Map<string, Entry>();
const MAX_CACHED_MANIFESTS = 24;

export function invalidateManifest(url: string): void {
  // Existing readers finish independently; a retry starts a fresh request.
  entries.delete(normalizeConfigUrl(url));
}

/** Share the raw JSON request, with cancellation owned independently by each consumer. */
export function fetchManifest(url: string, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  const key = normalizeConfigUrl(url);
  let entry = entries.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: Entry = { controller, readers: 0, settled: false, promise: Promise.resolve() };
    created.promise = fetch(key, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load config ${response.status}: ${response.statusText}`);
      return response.json();
    }).then((raw) => {
      created.settled = true;
      for (const [cachedKey, cached] of entries) {
        if (entries.size <= MAX_CACHED_MANIFESTS) break;
        if (cachedKey !== key && cached.settled && cached.readers === 0) entries.delete(cachedKey);
      }
      return raw;
    }, (error: unknown) => {
      created.settled = true;
      if (entries.get(key) === created) entries.delete(key);
      throw error;
    });
    entries.set(key, created);
    entry = created;
  }
  const shared = entry;
  shared.readers += 1;
  return new Promise((resolve, reject) => {
    let finished = false;
    const release = () => {
      if (finished) return false;
      finished = true;
      signal?.removeEventListener('abort', abort);
      shared.readers -= 1;
      if (!shared.settled && shared.readers === 0) {
        if (entries.get(key) === shared) entries.delete(key);
        shared.controller.abort();
      }
      return true;
    };
    const abort = () => { if (release()) reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    shared.promise.then((raw) => { if (release()) resolve(raw); }, (error: unknown) => { if (release()) reject(error); });
  });
}
