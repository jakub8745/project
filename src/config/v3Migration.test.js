import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertV2ToV3, sha256 } from '../../scripts/lib/exhibitMigration.mjs';
import { validateManifest } from '../../scripts/lib/validateManifest.mjs';
import { compileExhibitConfigV3, validateRuntimeV3 } from './loaders/compileExhibitConfigV3';
import { compileContextualActions } from './contextualActions';
import { BPA_IPFS_GATEWAYS, resolveRuntimeAssetCandidates } from './assetResolution';
const read = (name) => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8'));
const inventory = read('scripts/exhibit-migrations.json');
afterEach(() => vi.unstubAllGlobals());

function mockSubtitles() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tracks:[{ language:'en', cues:[{start:0,end:2,text:'Fixture transcript'}] }] }), {status:200})));
}

function migrationComparableManifest(manifest) {
  const comparable = structuredClone(manifest);
  if (comparable.metadata) delete comparable.metadata.tileDescription;
  const scene = comparable.sceneGraph?.sourceScene;
  const profile = comparable.sceneGraph?.viewerProfiles?.r3fCurrent;
  const curatedAssetSourceOverrides = {
    lockdowns: ['background_texture'],
    dystopia: ['dzbanDystopia_audio'],
    cipriani: ['background_texture', 'ciprianiAudio_audio'],
    identity: [
      'background_texture',
      'WielekEibejzyt_image',
      'WielekPalec_image',
      'WilekSchizofrenia_image',
      'DreamerStarman_image',
      'DreamerPiotr_image',
      'DreamerSpaceman_image',
      'DreamerAura_image',
      'DreamerFlowerman_image',
      'Hidden_image',
      'Unreal_video',
      'Heritage_video'
    ]
  };
  for (const assetId of curatedAssetSourceOverrides[comparable.slug] || []) {
    if (comparable.assets?.[assetId]) delete comparable.assets[assetId].sourceUri;
  }
  if (comparable.slug === 'dystopia') {
    delete scene?.renderer?.autoExposure;
    if (profile?.params) delete profile.params.autoExposure;
  }
  if (scene?.background) {
    delete scene.background.color;
    delete scene.background.intensity;
  }
  const exposureKeys = ['exposure', 'exposureTarget', 'exposureMin', 'exposureMax'];
  for (const record of [scene?.renderer, profile?.params]) {
    if (!record) continue;
    for (const key of exposureKeys) delete record[key];
  }
  if (comparable.slug === 'lockdowns' && profile?.params) {
    delete profile.params.backgroundIntensity;
    delete profile.params.lightIntensity;
    if (profile.params.colorGrade) delete profile.params.colorGrade.brightness;
  }
  if (comparable.slug === 'dystopia' && profile?.params) {
    delete profile.params.lightIntensity;
    if (profile.params.colorGrade) delete profile.params.colorGrade.brightness;
  }
  if (comparable.slug === 'dystopia') {
    for (const asset of Object.values(comparable.assets || {})) {
      if (Array.isArray(asset.fallbackUris)) delete asset.fallbackUris;
    }
  }
  if (comparable.slug === 'lockdowns') {
    for (const asset of Object.values(comparable.assets || {})) {
      if (Array.isArray(asset.fallbackUris)) delete asset.fallbackUris;
    }
  }
  if (comparable.slug === 'cipriani') {
    for (const asset of Object.values(comparable.assets || {})) {
      if (Array.isArray(asset.fallbackUris)) delete asset.fallbackUris;
    }
    for (const instance of comparable.sceneGraph?.modules?.audio?.instances || []) {
      if (instance.targetNode === 'ciprianiAudio') delete instance.volume;
    }
    for (const interaction of comparable.interactions || []) {
      if (interaction?.behavior?.targetNode === 'ciprianiAudio') delete interaction.behavior.volume;
    }
  }
  if (comparable.slug === 'wakeupcall' && scene?.spawn) {
    delete scene.spawn.direction;
  }
  if (comparable.slug === 'wakeupcall') {
    for (const asset of Object.values(comparable.assets || {})) {
      if (Array.isArray(asset.fallbackUris)) delete asset.fallbackUris;
    }
  }
  if (comparable.slug === 'videopoetry') {
    for (const asset of Object.values(comparable.assets || {})) {
      if (Array.isArray(asset.fallbackUris)) delete asset.fallbackUris;
    }
  }
  if (comparable.slug === 'prompt_procedural_room' && Array.isArray(profile?.models)) {
    for (const model of profile.models) {
      if (model?.id === 'robot' || model?.id === 'robot_2') delete model.enabled;
    }
  }
  return comparable;
}

describe('v3 migration parity', () => {
  it.each(inventory)('$slug validates and preserves its v2 source', (job) => {
    const raw = read(`public/configs/${job.v3}`);
    expect(validateManifest(raw).errors).toEqual([]);
    if (!job.curated) {
      const text = readFileSync(new URL(`../../archive/v2/${job.v2}`, import.meta.url),'utf8');
      if (job.slug === 'bednarczyk') {
        // Migration input at df0abb0; the mutable V2 file later changed its links.
        expect(raw.sourceManifest.sha256).toBe('94c40369edf44377a5cd71f21d5626783f2db2c890c5f66758a23a92ce3435f1');
        expect(raw.sceneGraph.viewerProfiles.r3fCurrent.links).toEqual(JSON.parse(text).viewer.links);
      } else {
        expect(raw.sourceManifest.sha256).toBe(sha256(text));
      }
      const result = convertV2ToV3(JSON.parse(text), {sourcePath:`public/configs/${job.v2}`,sourceHash:sha256(text),id:job.id || JSON.parse(text).id,slug:job.slug});
      if (job.slug === 'bednarczyk') {
        // The v3 candidate intentionally applies a brighter presentation profile;
        // its source scene and viewer settings are otherwise converter-equivalent.
        expect(raw.sceneGraph.sourceScene.renderer).toMatchObject({autoExposure:false, exposure:1.55});
        expect(raw.sceneGraph.viewerProfiles.r3fCurrent.params).toMatchObject({
          autoExposure:false,
          exposure:1.55,
          lightIntensity:1.45,
          backgroundIntensity:0.5
        });
      } else {
        const converted = migrationComparableManifest(result.manifest);
        const current = migrationComparableManifest(raw);
        if (job.slug === 'cipriani') {
          // The V3 level is intentionally 30% lower; V2's volume=10 prose is stale.
          expect(JSON.parse(text).modules.audio.instances.find((instance) => instance.targetNode === 'ciprianiAudio').volume).toBe(1);
          expect(raw.sceneGraph.modules.audio.instances.find((instance) => instance.targetNode === 'ciprianiAudio').volume).toBe(0.7);
          expect(converted.sceneGraph.nodes.ciprianiAudio.metadata.interactionDescription).toContain('volume=10.');
          expect(current.sceneGraph.nodes.ciprianiAudio.metadata.interactionDescription).toContain('volume=0.7.');
          delete converted.sceneGraph.nodes.ciprianiAudio.metadata.interactionDescription;
          delete current.sceneGraph.nodes.ciprianiAudio.metadata.interactionDescription;
        }
        expect(converted).toEqual(current);
      }
      expect(result.unmappedFields).toEqual([]);
    }
  });
  it.each(inventory)('$slug keeps its authoritative V3 scene compilable', async (job) => {
    mockSubtitles();
    const raw = read(`public/configs/${job.v3}`);
    const current = await compileExhibitConfigV3(raw);
    expect(current.id).toBe(raw.id);
    expect(current.metadata.title).toBe(raw.metadata.title);
    expect(current.modelPath ? current.modelPath.length > 0 : Boolean(current.proceduralRoom)).toBe(true);
  });
  it.each(inventory)('$slug keeps declared Oracle sources ahead of IPFS fallbacks', (job) => {
    const raw = read(`public/configs/${job.v3}`);
    for (const [assetId, asset] of Object.entries(raw.assets)) {
      const declarations = [asset.sourceUri, asset.ipfsUri, asset.arweaveUri, ...(asset.fallbackUris || [])]
        .filter((uri) => typeof uri === 'string');
      const hasOracle = declarations.some((uri) => /^https?:\/\//i.test(uri) && uri.includes('.objectstorage.'));
      const hasIpfs = declarations.some((uri) => /^ipfs:\/\//i.test(uri));
      const candidates = resolveRuntimeAssetCandidates(asset);
      if (hasOracle && hasIpfs) {
        const oracleIndex = candidates.findIndex((uri) => uri.includes('.objectstorage.'));
        const ipfsIndex = candidates.findIndex((uri) => BPA_IPFS_GATEWAYS.some((gateway) => uri.startsWith(gateway)));
        expect(oracleIndex, `${job.slug}:${assetId} Oracle candidate`).toBe(0);
        expect(ipfsIndex, `${job.slug}:${assetId} IPFS candidate`).toBeGreaterThan(oracleIndex);
      } else if (hasIpfs) {
        expect(candidates[0], `${job.slug}:${assetId} IPFS candidate`).toMatch(/^https:\/\//);
        expect(candidates[0]).not.toContain('.objectstorage.');
      }
    }
  });
  it.each(inventory)('$slug declares a visible background fallback and a lighter exposure', (job) => {
    const raw = read(`public/configs/${job.v3}`);
    const scene = raw.sceneGraph.sourceScene;
    const background = scene.background;
    const exposure = raw.sceneGraph.viewerProfiles.r3fCurrent.params.exposure;

    expect(background.color).toBe('#e2ddd1');
    expect(exposure).toBeGreaterThan(1);
    if (background.backgroundAsset) expect(background.intensity).toBeGreaterThanOrEqual(1.15);
    if (typeof scene.renderer?.exposure === 'number') expect(scene.renderer.exposure).toBe(exposure);
  });
  it('uses the requested Wake-Up Call spawn facing', () => {
    const raw = read('public/configs/wakeup_config_v3.json');
    expect(raw.sceneGraph.sourceScene.spawn.direction).toEqual([-0.9659258263, 0, -0.2588190451]);
  });
  it('reduces Cipriani spatial music volume by 30 percent', () => {
    const raw = read('public/configs/cipriani_config_v3.json');
    const audio = raw.sceneGraph.modules.audio.instances.find((instance) => instance.targetNode === 'ciprianiAudio');
    const interaction = raw.interactions.find((entry) => entry.behavior?.targetNode === 'ciprianiAudio');

    expect(audio?.volume).toBe(0.7);
    expect(interaction?.behavior?.volume).toBe(0.7);
  });
  it('makes Dystopia slightly brighter through its declared rendering profile', () => {
    const raw = read('public/configs/dystopia_config_v3.json');
    const scene = raw.sceneGraph.sourceScene;
    const params = raw.sceneGraph.viewerProfiles.r3fCurrent.params;

    expect(scene.background.intensity).toBe(1.25);
    expect(scene.renderer).toMatchObject({autoExposure:false, exposure:1.4, exposureTarget:1.4});
    expect(params).toMatchObject({autoExposure:false, exposure:1.4, exposureTarget:1.4});
    expect(params.lightIntensity).toBe(1.3);
    expect(params.colorGrade.brightness).toBe(1.05);
  });
  it('keeps Collision Salon robot models declared but disabled', () => {
    const raw = read('public/configs/prompt_procedural_room_config_v3.json');
    const models = raw.sceneGraph.viewerProfiles.r3fCurrent.models;
    expect(models.filter((model) => model.id === 'robot' || model.id === 'robot_2'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'robot', enabled: false }),
        expect.objectContaining({ id: 'robot_2', enabled: false })
      ]));
  });
  it.each(inventory.filter((entry) => !entry.curated))('$slug compiles the declared v3 scene semantics', async (job) => {
    mockSubtitles();
    const raw = read(`public/configs/${job.v3}`);
    const next = await compileExhibitConfigV3(raw);
    const scene = raw.sceneGraph.sourceScene;

    expect(next.id).toBe(raw.id);
    expect(next.metadata.title).toBe(raw.metadata.title);
    expect(next.modelPath ? next.modelPath.length > 0 : Boolean(next.proceduralRoom)).toBe(true);
    for (const [key, value] of Object.entries(scene.renderer || {})) {
      expect(next.params[key], `${job.slug} sourceScene.renderer.${key}`).toEqual(value);
    }
    if (scene.spawn?.position) expect(next.params.visitorEnter).toEqual(scene.spawn.position);
    if (scene.spawn?.direction) expect(next.params.spawnDirection).toEqual(scene.spawn.direction);
    if (typeof scene.background?.blurriness === 'number') {
      expect(next.params.backgroundBlurriness).toBe(scene.background.blurriness);
    }
    if (typeof scene.background?.intensity === 'number') {
      expect(next.params.backgroundIntensity).toBe(scene.background.intensity);
    }
    expect(Object.keys(next.objects || {})).toEqual(Object.keys(raw.sceneGraph.nodes));
    expect(next.sidebar?.items?.map((item) => item.id)).toEqual(
      raw.content.sidebar.items.filter((item) => item.id !== 'help-icon').map((item) => item.id)
    );
    if (job.id === 'bednarczyk') {
      expect(next.audio[0].url).toContain('/b/dystopia/o/pouring_milk.mp3');
    }
  });
  it('restores renderer, transforms and thumbnail precedence independently of exhibit fixtures', async () => {
    const raw = {
      schemaVersion:'2.0.0',id:'fixture',metadata:{title:'Fixture',description:'Fixture'},
      assets:{scene:{kind:'model',uri:'/scene.glb',mimeType:'model/gltf-binary'}},
      scene:{model:{asset:'scene',scale:2,position:[1,2,3]},renderer:{toneMapping:'cineon',maxDpr:1,exposure:0.7}},nodes:{},
      thumbnailCapture:{enabled:true,fps:24},viewer:{params:{exposure:1.2},thumbnailCapture:{enabled:true,fps:30}}
    };
    const {manifest} = convertV2ToV3(raw,{sourcePath:'fixture.json'});
    const result = await compileExhibitConfigV3(manifest);
    expect(result).toMatchObject({modelPath:'/scene.glb',scale:2,position:[1,2,3],params:{toneMapping:'cineon',maxDpr:1,exposure:0.7},thumbnailCapture:{fps:30}});
    delete manifest.sceneGraph.viewerProfiles.r3fCurrent.thumbnailCapture;
    expect((await compileExhibitConfigV3(manifest)).thumbnailCapture).toEqual({enabled:true,fps:24});
  });
  it('keeps optional subtitles asynchronous and normalizes subsequent updates', async () => {
    const requestedUrls = [];
    vi.stubGlobal('fetch',vi.fn(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('.objectstorage.')) return new Response('',{status:503});
      if (url.includes('/ipfs/')) {
        return new Response(JSON.stringify({tracks:[{language:'en',cues:[{start:0,end:1,text:'Hello'}]}]}));
      }
      return new Response('',{status:404});
    }));
    const update = vi.fn();
    const source = read('public/configs/vectai_krakow_032026_config_v3.json');
    const initial = await compileExhibitConfigV3(source,undefined,update);
    expect(initial.modelPath).toContain('/b/vectai/');
    expect(update).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    expect(requestedUrls[0]).toContain('.objectstorage.');
    expect(requestedUrls[1]).toContain('/ipfs/');
    expect(update.mock.lastCall[0].params).toEqual(initial.params);
    expect(update.mock.lastCall[0].audio.some((audio) => audio.subtitleTracks?.[0]?.language==='en')).toBe(true);
  });
  it('compiles VectAI contextual actions without fetching optional media', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
    const manifest = validateRuntimeV3(read('public/configs/vectai_krakow_032026_config_v3.json'));
    const context = compileContextualActions({ metadata: manifest.metadata, assets: manifest.assets, media: manifest.content.media, sidebar: manifest.content.sidebar });
    expect(context.length).toBeGreaterThan(0);
    expect(Object.keys(manifest.content.media).length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('retains unknown extensions and reports them', () => {
    const raw = read('archive/v2/lockdowns_config.json'); raw.customExtension={foo:'bar'};
    const result = convertV2ToV3(raw);
    expect(result.unmappedFields).toEqual(['customExtension']);
    expect(result.manifest.extensions.legacy.customExtension).toEqual({foo:'bar'});
  });
  it('rejects unresolved asset references and duplicate interaction IDs', () => {
    const raw = read('public/configs/lockdowns_config_v3.json');
    raw.sceneGraph.sourceScene.model.asset='missing';
    raw.interactions.push(raw.interactions[0]);
    expect(validateManifest(raw).errors.join('\n')).toContain('unknown asset missing');
    expect(validateManifest(raw).errors.join('\n')).toContain('Duplicate interaction ID');
  });
});
