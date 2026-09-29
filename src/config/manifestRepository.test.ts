import { afterEach, expect, it, vi } from 'vitest';
import { fetchManifest, invalidateManifest } from './manifestRepository';
import { validateRuntimeV3 } from './loaders/compileExhibitConfigV3';
afterEach(() => vi.unstubAllGlobals());
it('shares a raw request and lets one reader abort without cancelling another', async () => {
  let respond!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  const first = fetchManifest('./configs/shared-fixture.json',controller.signal);
  const second = fetchManifest('/configs/shared-fixture.json');
  const rejection = expect(first).rejects.toMatchObject({name:'AbortError'});
  controller.abort();
  await rejection;
  respond(new Response(JSON.stringify({id:'shared'})));
  await expect(second).resolves.toEqual({id:'shared'});
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(fetchManifest('/configs/shared-fixture.json')).resolves.toEqual({id:'shared'});
  expect(fetch).toHaveBeenCalledTimes(1);
  invalidateManifest('/configs/shared-fixture.json');
});
it('cancels abandoned requests and separates manifest URL caches', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn((_url, options) => {
    signals.push(options.signal);
    return new Promise(() => {});
  }));
  const a = new AbortController(); const b = new AbortController();
  const requests = [fetchManifest('/gallery-a.json',a.signal),fetchManifest('/gallery-b.json',b.signal)];
  const result = Promise.allSettled(requests);
  a.abort(); b.abort();
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect((await result).every((entry) => entry.status === 'rejected')).toBe(true);
});
it('retries failed manifests rather than caching the failure', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(new Response('{"id":"retry"}'));
  vi.stubGlobal('fetch',fetch);
  await expect(fetchManifest('/retry-fixture.json')).rejects.toThrow('503');
  await expect(fetchManifest('/retry-fixture.json')).resolves.toEqual({id:'retry'});
  invalidateManifest('/retry-fixture.json');
});
it('rejects malformed v3 scene graphs with a useful error', () => {
  expect(() => validateRuntimeV3({schemaVersion:'3.0.0',id:'invalid',assets:{},metadata:{}})).toThrow('sceneGraph');
});
