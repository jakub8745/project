import { describe, expect, it } from 'vitest';
import { resolveRuntimeAsset, resolveRuntimeAssetCandidates } from './assetResolution';
import { normalizeManifestShape } from './manifestShape';

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

  it('preserves the archive source declarations when adapting v3 assets', () => {
    const raw = {
      schemaVersion: '3.0.0',
      id: 'fixture',
      metadata: { title: 'Fixture', description: '' },
      assets: { model: { sourceUri: '/model.glb', ipfsUri: ipfs, fallbackUris: [oracle] } },
      content: {},
      sceneGraph: { sourceScene: {}, nodes: {} }
    };
    const manifest = normalizeManifestShape(raw);
    const modelAsset = manifest.assets.model as unknown as Record<string, unknown>;
    expect(resolveRuntimeAssetCandidates(modelAsset as Parameters<typeof resolveRuntimeAssetCandidates>[0])[0]).toBe(oracle);
    expect(modelAsset.sourceUri).toBe('/model.glb');
    expect(modelAsset.ipfsUri).toBe(ipfs);
  });
});
