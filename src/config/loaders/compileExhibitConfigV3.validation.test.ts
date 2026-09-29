import { describe, expect, it } from 'vitest';
import { compileExhibitConfigV3 } from './compileExhibitConfigV3';

describe('native V3 validation', () => {
  it.each([
    [{}, 'schemaVersion'],
    [{ schemaVersion: '2.0.0', id: 'test', assets: {}, scene: {} }, 'schemaVersion 3.x'],
    [{ schemaVersion: '3.0.0', assets: {} }, 'id'],
    [{ schemaVersion: '3.0.0', id: 'test' }, 'assets'],
    [{ schemaVersion: '3.0.0', id: 'test', assets: {}, metadata: {} }, 'sceneGraph']
  ])('rejects malformed remote config %#', async (raw, expectedMessage) => {
    await expect(compileExhibitConfigV3(raw)).rejects.toThrow(expectedMessage);
  });
});
