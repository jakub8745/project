import { expect, it } from 'vitest';
import { resolveRuntimeAsset } from './assetResolution';
import { normalizeManifestShape } from './manifestShape';
it('uses explicit ordered fallbacks for IPFS without changing canonical archival fields', () => {
  const asset={uri:'ipfs://canonical/model.glb',fallbackUris:['https://primary.example/model.glb','https://secondary.example/model.glb']};
  expect(resolveRuntimeAsset(asset,'different-bucket')).toBe('https://primary.example/model.glb');
  expect(asset.uri).toBe('ipfs://canonical/model.glb');
});
it('preserves a non-IPFS primary URL before its fallbacks', () => {
  const raw={schemaVersion:'3.0.0',id:'fixture',metadata:{title:'Fixture',description:''},assets:{model:{sourceUri:'https://primary.example/model.glb',ipfsUri:null,fallbackUris:['https://backup.example/model.glb']}},content:{},sceneGraph:{sourceScene:{},nodes:{}}};
  const manifest=normalizeManifestShape(raw);
  expect(resolveRuntimeAsset(manifest.assets.model,manifest.id)).toBe('https://primary.example/model.glb');
});
it('prefers an Oracle fallback over a local v3 source path', () => {
  const asset={sourceUri:'/textures/vectai/poster.png',ipfsUri:'ipfs://canonical/poster.png',fallbackUris:['https://objectstorage.example/poster.png']};
  expect(resolveRuntimeAsset(asset,'vectai')).toBe('https://objectstorage.example/poster.png');
});
it('derives Oracle from the canonical IPFS URI when no remote URL is configured', () => {
  const asset={ipfsUri:'ipfs://canonical/poster.png'};
  expect(resolveRuntimeAsset(asset,'bednarczyk')).toContain('/b/bednarczyk/o/poster.png');
});
