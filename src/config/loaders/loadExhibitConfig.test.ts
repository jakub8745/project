import { describe, expect, it } from 'vitest';
import { loadExhibitConfig } from './loadExhibitConfig';

describe('loadExhibitConfig validation', () => {
  it.each([
    [{}, 'schemaVersion'],
    [{ schemaVersion: '2.0.0', assets: {}, scene: {} }, 'id'],
    [{ schemaVersion: '2.0.0', id: 'test', scene: {} }, 'assets'],
    [{ schemaVersion: '2.0.0', id: 'test', assets: {} }, 'scene']
  ])('rejects malformed remote config %#', async (raw, expectedMessage) => {
    await expect(loadExhibitConfig(raw)).rejects.toThrow(expectedMessage);
  });
});
