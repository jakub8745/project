import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileExhibitSnapshot } from './compiledExhibitSnapshot';

const v3 = JSON.parse(readFileSync(new URL('../../public/configs/lockdowns_config_v3.json', import.meta.url), 'utf8'));

describe('authoritative V3 snapshot boundary', () => {
  it('rejects an archived V2 manifest without trying a compatibility compiler', async () => {
    await expect(compileExhibitSnapshot({ schemaVersion: '2.0.0', id: 'historical', assets: {}, scene: {} }, '/configs/lockdowns_config.json'))
      .rejects.toThrow('Expected schemaVersion 3.x');
  });

  it('surfaces a broken V3 reference instead of selecting archived V2', async () => {
    const broken = structuredClone(v3);
    broken.sceneGraph.sourceScene.model.asset = 'missing-model';
    await expect(compileExhibitSnapshot(broken, '/configs/lockdowns_config_v3.json'))
      .rejects.toThrow('references an unknown asset missing-model');
  });
});
