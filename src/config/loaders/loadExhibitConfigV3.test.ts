import { describe, expect, it } from 'vitest';
import vectaiV3 from '../../../public/configs/vectai_krakow_032026_config_v3.json';
import { loadExhibitConfig } from './loadExhibitConfig';

const ORACLE_PREFIX = 'https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/';

describe('V3 runtime adapter', () => {
  it('uses Oracle fallbacks before canonical IPFS URIs', async () => {
    const config = await loadExhibitConfig(vectaiV3);
    expect(config.modelPath).toMatch(/^https:\/\/lrbcisjgkyhb\.objectstorage\./);
    expect(config.images?.image_tablica?.imagePath).toMatch(new RegExp(`^${ORACLE_PREFIX}`));
    const firstVideo = config.videos?.[0] as Record<string, unknown> | undefined;
    const firstSource = Array.isArray(firstVideo?.sources) ? firstVideo.sources[0] as Record<string, unknown> : undefined;
    expect(firstSource?.src).toMatch(new RegExp(`^${ORACLE_PREFIX}`));
    expect(config.audio?.[0]?.url).toMatch(new RegExp(`^${ORACLE_PREFIX}`));
  });

  it('does not expose moved local procedural asset paths', async () => {
    const config = await loadExhibitConfig(vectaiV3);
    const modelPaths = (config.models || []).map((model) => model.path);
    expect(modelPaths.every((path) => typeof path === 'string' && path.startsWith(ORACLE_PREFIX))).toBe(true);
  });
});
