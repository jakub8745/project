import { describe, expect, it } from 'vitest';
import { loadRuntimeAssetWithFallback, resolveRuntimeAsset, resolveRuntimeAssetCandidates } from './assetResolution';
import ciprianiManifest from '../../public/configs/cipriani_config_v3.json';
import ciprianiLegacy from '../../archive/v2/cipriani_config.json';
import dystopiaManifest from '../../public/configs/dystopia_config_v3.json';
import wakeupManifest from '../../public/configs/wakeup_config_v3.json';
import lockdownsManifest from '../../public/configs/lockdowns_config_v3.json';
import tomManifest from '../../public/configs/tom_exhibit_config_v3.json';

const oracle = 'https://namespace.objectstorage.uk-london-1.oci.customer-oci.com/n/namespace/b/archive/o/model.glb';
const ipfs = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh3w4hpxf2f2x7u4scm4m5q4n6x2q7p4e/model.glb';

describe('manifest-backed asset resolution', () => {
  it('uses an explicitly declared Oracle source before IPFS and local development paths', () => {
    const candidates = resolveRuntimeAssetCandidates({
      sourceUri: '/models/model.glb',
      ipfsUri: ipfs,
      fallbackUris: [oracle]
    });

    expect(candidates[0]).toBe(oracle);
    expect(candidates[1]).toContain('/ipfs/bafybeigdyrzt5sfp7udm7hu76uh3w4hpxf2f2x7u4scm4m5q4n6x2q7p4e/model.glb');
    expect(candidates[candidates.length - 1]).toBe('/models/model.glb');
    expect(resolveRuntimeAsset({ sourceUri: '/models/model.glb', ipfsUri: ipfs, fallbackUris: [oracle] })).toBe(oracle);
  });

  it('keeps only sources declared by the asset plus generic configured gateways', () => {
    const asset = { sourceUri: ipfs, ipfsUri: ipfs };
    const candidates = resolveRuntimeAssetCandidates(asset);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.every((url) => url.startsWith('https://'))).toBe(true);
    expect(candidates.some((url) => url.includes('/b/archive/o/'))).toBe(false);
  });

  it('orders any declared cloud URL before IPFS while retaining the canonical CID', () => {
    const cloud = 'https://cdn.example.org/models/model.glb';
    const asset = { sourceUri: ipfs, ipfsUri: ipfs, fallbackUris: [cloud] };
    const candidates = resolveRuntimeAssetCandidates(asset);
    expect(candidates[0]).toBe(cloud);
    expect(candidates[1]).toContain('https://ipfs.io/ipfs/');
    expect(asset.ipfsUri).toBe(ipfs);
  });

  it('resolves every Cipriani photograph to its declared bucket object before IPFS', () => {
    const assets = ciprianiManifest.assets as unknown as Record<string, { ipfsUri?: string | null; sourceUri?: string; fallbackUris?: string[] }>;
    const photographIds = ['cipriani_opis_image', ...Array.from({ length: 39 }, (_, i) => `cipriani_pic_${i + 5}_image`)];
    for (const id of photographIds) {
      const asset = assets[id];
      const filename = asset.ipfsUri!.split('/').pop();
      expect(resolveRuntimeAssetCandidates(asset)[0]).toBe(
        `https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/cipriani/o/${filename}`
      );
      expect(asset.ipfsUri).toContain('ipfs://');
    }
  });

  it('preserves Oracle-first declarations in the archived Cipriani V2 source', () => {
    const assets = ciprianiLegacy.assets as unknown as Record<string, { uri?: string; fallbackUris?: string[] }>;
    const photographIds = ['cipriani_opis_image', ...Array.from({ length: 39 }, (_, i) => `cipriani_pic_${i + 5}_image`)];
    for (const id of photographIds) {
      const asset = assets[id];
      const filename = asset.uri!.split('/').pop();
      expect(resolveRuntimeAssetCandidates(asset)[0]).toBe(
        `https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/cipriani/o/${filename}`
      );
      expect(asset.uri).toContain('ipfs://');
    }
  });

  it('resolves Dystopia scene model and background through their declared Oracle mirrors', () => {
    for (const [id, filename] of [['scene_model', 'exhibition_dystopia.glb'], ['background_texture', 'bg_dystopia.ktx2']] as const) {
      const asset = dystopiaManifest.assets[id];
      expect(resolveRuntimeAssetCandidates(asset)[0]).toBe(
        `https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/dystopia/o/${filename}`
      );
      expect(asset.ipfsUri).toContain('ipfs://');
    }
  });

  it('resolves Dystopia Milkmaid to the declared Oracle object while retaining its IPFS CID', () => {
    const asset = dystopiaManifest.assets.Milkmaid_image;
    expect(resolveRuntimeAssetCandidates(asset)[0]).toBe(
      'https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/dystopia/o/milkmaid.jpg'
    );
    expect(asset.ipfsUri).toContain('ipfs://');
  });

  it('uses the shared Cipriani Oracle background texture for Videopoetry', () => {
    const ciprianiBackground = ciprianiManifest.assets.background_texture;
    const videopoetryBackground = tomManifest.assets.background_texture;
    expect(ciprianiBackground.ipfsUri).toBe(videopoetryBackground.ipfsUri);
    expect(resolveRuntimeAssetCandidates(videopoetryBackground)[0]).toBe(
      'https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/cipriani/o/bg_puno85.ktx2'
    );
  });

  it('resolves every Lockdowns image to its declared Oracle bucket while retaining its IPFS CID', () => {
    for (const [id, asset] of Object.entries(lockdownsManifest.assets)) {
      if (!id.endsWith('_image')) continue;
      const filename = asset.ipfsUri!.split('/').pop();
      expect(resolveRuntimeAssetCandidates(asset)[0]).toBe(
        `https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/lockdowns/o/${filename}`
      );
      expect(asset.ipfsUri).toContain('ipfs://');
    }
  });

  it('resolves every Wake-Up Call poster and its background to the declared Oracle bucket', () => {
    for (const [id, asset] of Object.entries(wakeupManifest.assets)) {
      if (id !== 'background_texture' && !id.endsWith('_image')) continue;
      const filename = asset.ipfsUri!.split('/').pop();
      expect(resolveRuntimeAssetCandidates(asset)[0]).toBe(
        `https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/wakeupcall/o/${filename}`
      );
      expect(asset.ipfsUri).toContain('ipfs://');
    }
  });

  it('uses shared sequential loading: fail over to IPFS, stop on cloud success, and report exhaustion', async () => {
    const candidates = resolveRuntimeAssetCandidates({ sourceUri: ipfs, ipfsUri: ipfs, fallbackUris: [oracle] });
    const attempted: string[] = [];
    const loaded = await loadRuntimeAssetWithFallback(candidates, async (url) => {
      attempted.push(url);
      if (url === oracle) throw new Error('Oracle unavailable');
      return 'IPFS data';
    }, 'test asset');
    expect(loaded).toBe('IPFS data');
    expect(attempted.slice(0, 2)).toEqual([oracle, candidates[1]]);

    attempted.length = 0;
    await expect(loadRuntimeAssetWithFallback(candidates, async (url) => {
      attempted.push(url);
      return 'Oracle data';
    }, 'test asset')).resolves.toBe('Oracle data');
    expect(attempted).toEqual([oracle]);

    await expect(loadRuntimeAssetWithFallback([], async () => 'unused', 'test asset'))
      .rejects.toThrow('No usable sources configured for test asset');
    await expect(loadRuntimeAssetWithFallback([oracle], async () => { throw new Error('offline'); }, 'test asset'))
      .rejects.toThrow('Unable to load test asset from any configured source');
  });

  it('loads an IPFS-only asset without inventing an Oracle URL', async () => {
    const candidates = resolveRuntimeAssetCandidates({ sourceUri: ipfs, ipfsUri: ipfs });
    const attempted: string[] = [];
    await expect(loadRuntimeAssetWithFallback(candidates, async (url) => {
      attempted.push(url);
      return 'IPFS data';
    }, 'IPFS-only image')).resolves.toBe('IPFS data');
    expect(attempted).toEqual([candidates[0]]);
    expect(candidates[0]).toContain('https://ipfs.io/ipfs/');
    expect(candidates.some((url) => url.includes('.objectstorage.'))).toBe(false);
  });

  it.each(['model', 'image', 'video', 'audio', 'document'] as const)(
    'applies cloud-first candidate ordering to %s assets', (kind) => {
      const asset = { kind, sourceUri: ipfs, ipfsUri: ipfs, fallbackUris: [oracle] };
      const candidates = resolveRuntimeAssetCandidates(asset);
      expect(candidates[0]).toBe(oracle);
      expect(candidates[1]).toContain('https://ipfs.io/ipfs/');
    }
  );

});
