import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GALLERIES, resolveGalleryConfigUrl } from './galleryConfig';
it.each(GALLERIES)('$slug defaults to v3 and retains explicit v2 access', (gallery) => {
  for (const version of ['2','3'] as const) {
    const url = resolveGalleryConfigUrl(gallery,`?configVersion=${version}`);
    const manifest = JSON.parse(readFileSync(`public${url}`,'utf8'));
    expect(manifest.schemaVersion.startsWith(`${version}.`)).toBe(true);
  }
  expect(resolveGalleryConfigUrl(gallery)).toBe(gallery.configUrls['3']);
  expect(resolveGalleryConfigUrl(gallery,'?configVersion=https://invalid.example/')).toBe(gallery.configUrls['3']);
  expect(gallery.configUrl).toBe(resolveGalleryConfigUrl(gallery));
});
