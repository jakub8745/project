import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertV2ToV3, sha256 } from '../../scripts/lib/exhibitMigration.mjs';
import { validateManifest } from '../../scripts/lib/validateManifest.mjs';
import { loadExhibitConfig } from './loaders/loadExhibitConfig';
import { normalizeManifestShape } from './manifestShape';
const read = (name) => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8'));
const inventory = read('scripts/exhibit-migrations.json');
afterEach(() => vi.unstubAllGlobals());

function mockSubtitles() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tracks:[{ language:'en', cues:[{start:0,end:2,text:'Fixture transcript'}] }] }), {status:200})));
}

describe('v3 migration parity', () => {
  it.each(inventory)('$slug validates and preserves its v2 source', (job) => {
    const raw = read(`public/configs/${job.v3}`);
    expect(validateManifest(raw).errors).toEqual([]);
    if (!job.curated) {
      const text = readFileSync(new URL(`../../public/configs/${job.v2}`, import.meta.url),'utf8');
      expect(raw.sourceManifest.sha256).toBe(sha256(text));
      const result = convertV2ToV3(JSON.parse(text), {sourcePath:`public/configs/${job.v2}`,sourceHash:sha256(text),id:job.id || JSON.parse(text).id,slug:job.slug});
      if (job.slug === 'bednarczyk') {
        // The v3 candidate intentionally applies a brighter presentation profile;
        // its source scene and viewer settings are otherwise converter-equivalent.
        expect(raw.sceneGraph.sourceScene.renderer).toMatchObject({autoExposure:false, exposure:1.35});
        expect(raw.sceneGraph.viewerProfiles.r3fCurrent.params).toMatchObject({
          autoExposure:false,
          exposure:1.35,
          lightIntensity:1.45,
          backgroundIntensity:0.5
        });
      } else {
        expect(result.manifest).toEqual(raw);
      }
      expect(result.unmappedFields).toEqual([]);
    }
  });
  it.each(inventory.filter((entry) => !entry.curated))('$slug preserves effective runtime settings', async (job) => {
    mockSubtitles();
    const old = await loadExhibitConfig(read(`public/configs/${job.v2}`));
    const next = await loadExhibitConfig(read(`public/configs/${job.v3}`));
    // Intentional, documented repairs: unique Bednarczyk ID and stable sidebar IDs.
    if (job.id) {
      old.id = job.id;
      expect(next.audio[0].url).toBe(old.audio[0].url);
      old.audio[0].fallbackUrls = [old.audio[0].url];
    }
    if (job.slug === 'bednarczyk') {
      old.params = {
        ...old.params,
        autoExposure: false,
        exposure: 1.35,
        exposureTarget: 1.2,
        exposureMin: 1,
        exposureMax: 1.6,
        colorGrade: {brightness: 1.2, contrast: 0.95, saturate: 0.82},
        lightIntensity: 1.45,
        backgroundIntensity: 0.5
      };
    }
    for (const [index,item] of (old.sidebar?.items || []).entries()) if (!item.id) item.id = `sidebar_${index}`;
    expect(next).toEqual(old);
  });
  it('restores renderer, transforms and thumbnail precedence independently of exhibit fixtures', async () => {
    const raw = {
      schemaVersion:'2.0.0',id:'fixture',metadata:{title:'Fixture',description:'Fixture'},
      assets:{scene:{kind:'model',uri:'/scene.glb',mimeType:'model/gltf-binary'}},
      scene:{model:{asset:'scene',scale:2,position:[1,2,3]},renderer:{toneMapping:'cineon',maxDpr:1,exposure:0.7}},nodes:{},
      thumbnailCapture:{enabled:true,fps:24},viewer:{params:{exposure:1.2},thumbnailCapture:{enabled:true,fps:30}}
    };
    const {manifest} = convertV2ToV3(raw,{sourcePath:'fixture.json'});
    const result = await loadExhibitConfig(manifest);
    expect(result).toMatchObject({modelPath:'/scene.glb',scale:2,position:[1,2,3],params:{toneMapping:'cineon',maxDpr:1,exposure:1.2},thumbnailCapture:{fps:30}});
    delete manifest.sceneGraph.viewerProfiles.r3fCurrent.thumbnailCapture;
    expect((await loadExhibitConfig(manifest)).thumbnailCapture).toEqual({enabled:true,fps:24});
  });
  it('keeps optional subtitles asynchronous and normalizes subsequent updates', async () => {
    let resolveFetch;
    vi.stubGlobal('fetch',vi.fn(() => new Promise((resolve) => {resolveFetch=resolve;})));
    const update = vi.fn();
    const source = read('public/configs/vectai_krakow_032026_config_v3.json');
    const initial = await loadExhibitConfig(source,undefined,update);
    expect(initial.modelPath).toContain('/b/vectai/');
    expect(update).not.toHaveBeenCalled();
    resolveFetch(new Response(JSON.stringify({tracks:[{language:'en',cues:[{start:0,end:1,text:'Hello'}]}]})));
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.lastCall[0].params).toEqual(initial.params);
    expect(update.mock.lastCall[0].audio.some((audio) => audio.subtitleTracks?.[0]?.language==='en')).toBe(true);
  });
  it('exposes VectAI sidebar without compiling or fetching optional media', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
    const manifest = normalizeManifestShape(read('public/configs/vectai_krakow_032026_config_v3.json'));
    expect(manifest.sidebar.items.length).toBeGreaterThan(0);
    expect(Object.keys(manifest.media).length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('retains unknown extensions and reports them', () => {
    const raw = read('public/configs/lockdowns_config.json'); raw.customExtension={foo:'bar'};
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
