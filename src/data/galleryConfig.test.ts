import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GALLERIES } from './galleryConfig';
it.each(GALLERIES)('$slug registers only its authoritative V3 manifest', (gallery) => {
  const manifest = JSON.parse(readFileSync(`public${gallery.configUrl}`,'utf8'));
  expect(manifest.schemaVersion.startsWith('3.')).toBe(true);
  expect(gallery).not.toHaveProperty('configUrls');
  expect(gallery).not.toHaveProperty('defaultConfigVersion');
});
