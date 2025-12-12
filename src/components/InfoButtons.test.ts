import { describe, expect, it } from 'vitest';
import { normalizeConfigUrl } from '../utils/url';

describe('normalizeConfigUrl', () => {
  it('keeps https absolute URLs unchanged', () => {
    expect(normalizeConfigUrl('https://example.com/config.json')).toBe('https://example.com/config.json');
  });

  it('keeps ipfs URLs unchanged', () => {
    expect(normalizeConfigUrl('ipfs://bafy12345/file.json')).toBe('ipfs://bafy12345/file.json');
  });

  it('keeps protocol-relative URLs unchanged', () => {
    expect(normalizeConfigUrl('//cdn.example.com/config.json')).toBe('//cdn.example.com/config.json');
  });

  it('prefixes relative paths with a leading slash', () => {
    expect(normalizeConfigUrl('configs/gallery.json')).toBe('/configs/gallery.json');
  });

  it('returns existing leading slash untouched', () => {
    expect(normalizeConfigUrl('/configs/gallery.json')).toBe('/configs/gallery.json');
  });
});
