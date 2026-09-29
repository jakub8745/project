import { describe, expect, it } from 'vitest';
import { compileRuntimeAsset, loadRuntimeAssetWithFallback, runtimeAssetCandidates } from './assetResolution';
import { compileExhibitConfigV3 } from './loaders/compileExhibitConfigV3';
import { materialModalCandidates } from '../r3f/materialModalSources';
import { loadVideoPoster } from '../modules/applyVideoMeshes.js';
import { parseAudioConfig } from '../r3f/useSceneAudioRouting';
import { parseSceneVideoConfig } from '../r3f/useSceneVideoConfig';
import { normalizeConfig } from './loaders/shared';
import type { ExhibitConfig } from './runtimeTypes';
import dystopiaV3 from '../../public/configs/dystopia_config_v3.json';
import vectaiV3 from '../../public/configs/vectai_krakow_032026_config_v3.json';

const oracle = 'https://namespace.objectstorage.uk-london-1.oci.customer-oci.com/n/namespace/b/test/o/image.jpg';
const cdn = 'https://cdn.example.org/image.jpg';
const ipfs = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh3w4hpxf2f2x7u4scm4m5q4n6x2q7p4e/image.jpg';

describe('authoritative runtime asset contract', () => {
  const asset = compileRuntimeAsset({ sourceUri: ipfs, ipfsUri: ipfs, fallbackUris: [cdn, oracle] });

  it('orders Oracle, other HTTP, IPFS gateways, then local; IPFS-only remains usable', () => {
    expect(asset.candidates.slice(0, 3)).toEqual([oracle, cdn, expect.stringContaining('https://ipfs.io/ipfs/')]);
    expect(compileRuntimeAsset({ sourceUri: ipfs }).candidates[0]).toContain('https://ipfs.io/ipfs/');
    const withLocal = compileRuntimeAsset({ sourceUri: '/local.jpg', fallbackUris: [cdn, oracle], ipfsUri: ipfs }).candidates;
    expect(withLocal[withLocal.length - 1]).toBe('/local.jpg');
  });

  it('advances after failure and stops after success', async () => {
    const attempts: string[] = [];
    await expect(loadRuntimeAssetWithFallback(asset.candidates, async (url) => {
      attempts.push(url);
      if (url === oracle) throw new Error('offline');
      return url;
    })).resolves.toBe(cdn);
    expect(attempts).toEqual([oracle, cdn]);
    attempts.length = 0;
    await loadRuntimeAssetWithFallback(asset.candidates, async (url) => { attempts.push(url); return url; });
    expect(attempts).toEqual([oracle]);
  });

  it('does not promote a previously successful image fallback on reopen', () => {
    const meta = { imageAsset: asset };
    expect(materialModalCandidates(meta).candidates[0]).toBe(oracle);
    // A browser cache may hold CDN bytes after a failed Oracle attempt.
    expect(materialModalCandidates(meta).candidates[0]).toBe(oracle);
    expect(materialModalCandidates({ pdfAsset: asset }).candidates).toEqual(asset.candidates);
  });

  it('advances video posters through the same ordered record', async () => {
    const attempts: string[] = [];
    const result = await loadVideoPoster(asset, async (url) => {
      attempts.push(url);
      if (url === oracle) throw new Error('offline');
      return url;
    });
    expect(result).toBe(cdn);
    expect(attempts).toEqual([oracle, cdn]);
  });

  it('compiles viewer-profile URL fields at the boundary without consumer ordering', () => {
    const config = normalizeConfig({
      images: { artwork: { imagePath: ipfs, oracleImagePath: oracle } },
      videos: [{ id: 'screen', poster: ipfs, oraclePoster: oracle, sources: [{ src: ipfs, oracleSrc: oracle }] }],
      audio: [{ id: 'track', url: ipfs, oracleUrl: oracle }]
    } as ExhibitConfig);
    expect((config.images?.artwork?.imageAsset as typeof asset).candidates[0]).toBe(oracle);
    expect((config.videos?.[0].posterAsset as typeof asset).candidates[0]).toBe(oracle);
    expect(((config.videos?.[0].sources as Record<string, unknown>[])[0].asset as typeof asset).candidates[0]).toBe(oracle);
    expect((config.audio?.[0].asset as typeof asset).candidates[0]).toBe(oracle);
  });

  it('preserves canonical image, audio, video, poster, and model candidates from V3', async () => {
    const config = await compileExhibitConfigV3(vectaiV3);
    const model = runtimeAssetCandidates(config.modelAsset);
    const image = runtimeAssetCandidates(config.images?.image_tablica?.imageAsset as typeof asset);
    const audio = parseAudioConfig(config);
    const video = parseSceneVideoConfig(config);
    expect(model[0]).toContain('.objectstorage.');
    expect(image[0]).toContain('.objectstorage.');
    expect(runtimeAssetCandidates(audio?.[0].asset)[0]).toContain('.objectstorage.');
    expect(runtimeAssetCandidates(video?.[0].sources[0].asset)[0]).toContain('.objectstorage.');
    expect(runtimeAssetCandidates(video?.[0].posterAsset).length).toBeGreaterThan(0);
    expect(audio?.[0].url).toBe(runtimeAssetCandidates(audio?.[0].asset)[0]);
    expect(video?.[0].sources[0].src).toBe(runtimeAssetCandidates(video?.[0].sources[0].asset)[0]);
    expect(config.images?.image_tablica).not.toHaveProperty('imageFallbackPaths');
    expect(config.audio?.[0]).not.toHaveProperty('fallbackUrls');
    expect((config.videos?.[0].sources as Record<string, unknown>[] | undefined)?.[0]).not.toHaveProperty('fallbackSrcs');
  });

  it('compiles V3 image and model candidates', async () => {
    const config = await compileExhibitConfigV3(dystopiaV3);
    expect(runtimeAssetCandidates(config.modelAsset)[0]).toContain('.objectstorage.');
    expect(runtimeAssetCandidates(config.images?.Milkmaid?.imageAsset as typeof asset)[0]).toContain('.objectstorage.');
  });
});
