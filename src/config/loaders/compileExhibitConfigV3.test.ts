import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BPA_IPFS_GATEWAYS, loadRuntimeAssetWithFallback, runtimeAssetCandidates, type RuntimeAsset } from '../assetResolution';
import { compileExhibitSnapshot } from '../compiledExhibitSnapshot';
import { compileExhibitConfigV3, validateRuntimeV3 } from './compileExhibitConfigV3';
import { parseAudioConfig, parseAudioFloorRoutes } from '../../r3f/useSceneAudioRouting';
import { parseLightZoneRoutes } from '../../r3f/useSceneLightZones';

const read = (file: string) => JSON.parse(readFileSync(new URL(`../../../public/configs/${file}`, import.meta.url), 'utf8'));
const vectai = read('vectai_krakow_032026_config_v3.json');
const cipriani = read('cipriani_config_v3.json');
const lisbon = read('videopoem_lisbon_112025_config_v3.json');
const procedural = read('prompt_procedural_room_config_v3.json');

// The compiler test runs without a DOM; keep source HTML visible to assertions.
vi.mock('../../utils/sanitizeHtml', () => ({ sanitizeSidebarHtml: (value: string | undefined) => value ?? '' }));

afterEach(() => vi.unstubAllGlobals());

function withoutOptionalFetches() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tracks: [] }), { status: 200 })));
}

describe('permanent native V3 runtime contract', () => {
  it('compiles model, nodes, images, documents, video and portable routes from V3', async () => {
    withoutOptionalFetches();
    const scene = await compileExhibitConfigV3(vectai, undefined, () => undefined);
    expect(scene.id).toBe(vectai.id);
    expect(scene.modelAsset?.candidates[0]).toContain('.objectstorage.');
    expect(scene.modelAsset?.candidates.some((url) => url.startsWith(BPA_IPFS_GATEWAYS[0]))).toBe(true);
    expect(scene.objects?.Visitor_enter?.category).toBe('enter');
    expect(scene.objects?.audio_left?.category).toBe('audio');
    expect(scene.images?.pdf_manual_pl?.pdfAsset).toEqual(expect.objectContaining({ candidates: expect.any(Array) }));
    expect(scene.images?.pdf_manual_pl?.imageAsset).toEqual(expect.objectContaining({ candidates: expect.any(Array) }));
    expect(scene.images?.image_tablica?.imageAsset).toEqual(expect.objectContaining({ candidates: expect.any(Array) }));
    const video = scene.videos?.find((entry) => entry.id === 'left_screen');
    expect(video).toMatchObject({ playbackMode: 'synced_silent', syncStartGroup: 'vectai_krakow_032026_main', disableAudio: true });
    expect(runtimeAssetCandidates(video?.posterAsset as RuntimeAsset)).toHaveLength(5);
    expect(runtimeAssetCandidates(video?.posterAsset as RuntimeAsset)[0]).toContain('.objectstorage.');
    expect(runtimeAssetCandidates((video?.sources as Array<{asset: RuntimeAsset}>)[0].asset)[0]).toContain('.objectstorage.');
    expect(parseAudioFloorRoutes(scene)).toEqual(expect.arrayContaining([expect.objectContaining({ floors: ['floor_ucieta', 'walls_main'] })]));
    expect(parseLightZoneRoutes(scene).find((route) => route.id === 'main_room_light')?.params?.exposure).toBe(1.24);
    expect(scene.audioZones).toHaveLength(vectai.interactions.filter((entry: {type: string}) => entry.type === 'location_audio_route').length);
    expect(scene.lightZones).toHaveLength(vectai.interactions.filter((entry: {type: string}) => entry.type === 'location_light_profile').length);
  });

  it('preserves declared V3 transforms, source-scene params and Cipriani audio level', async () => {
    withoutOptionalFetches();
    const scene = await compileExhibitConfigV3(cipriani, undefined, () => undefined);
    expect(scene.params?.visitorEnter).toEqual([-6, 2, 3]);
    expect(scene.params?.exposure).toBe(1.95);
    expect(scene.params?.backgroundIntensity).toBe(1.15);
    expect(scene.backgroundAsset?.candidates[0]).toContain('.objectstorage.');
    expect(scene.objects?.ciprianiAudio?.category).toBe('audio');
    expect(scene.audio?.find((entry) => entry.id === 'ciprianiAudio')?.volume).toBe(0.7);
    expect(parseAudioConfig(scene)?.find((entry) => entry.id === 'ciprianiAudio')?.volume).toBe(0.7);
    const lisbonScene = await compileExhibitConfigV3(lisbon, undefined, () => undefined);
    expect(lisbonScene.scale).toBe(1);
    expect(lisbonScene.params?.visitorEnter).toEqual([0, 4, 0]);
    expect(lisbonScene.params?.spawnDirection).toBe('north-east');
    expect(lisbonScene.params?.toneMapping).toBe('cineon');
    // The current viewer-profile images map replaces generated media records.
    expect(lisbonScene.images?.curatorial_dossier).toBeUndefined();
  });

  it('keeps procedural profile data authoritative without activating the archival recipe', async () => {
    const raw = structuredClone(procedural);
    raw.sceneGraph.proceduralRecipe.room.width = 999;
    raw.sceneGraph.sourceScene.camera = { mode: 'fixed', fov: 12 };
    raw.sceneGraph.sourceScene.lights = [{ id: 'archival-light', type: 'ambient', intensity: 99 }];
    raw.interactions.push({ id: 'unused-action', type: 'open_link', targets: ['visitor'], behavior: { uri: 'https://example.com' } });
    const scene = await compileExhibitConfigV3(raw, undefined, () => undefined);
    expect((scene.proceduralRoom as {width: number}).width).toBe(procedural.sceneGraph.viewerProfiles.r3fCurrent.proceduralRoom.width);
    expect(runtimeAssetCandidates((scene.proceduralRoom as {wallTextureAsset: RuntimeAsset}).wallTextureAsset)).toHaveLength(1);
    expect(scene.models).toHaveLength(procedural.sceneGraph.viewerProfiles.r3fCurrent.models.length);
    expect(scene.physics).toBeDefined();
    expect(scene.environmentAsset?.candidates).toHaveLength(1);
    expect(scene.camera).toBeUndefined();
    expect(scene.lights).toEqual(procedural.sceneGraph.viewerProfiles.r3fCurrent.lights);
    expect(scene.interactions).toBeUndefined();
  });

  it('applies top-level viewer and portable-route replacement precedence', async () => {
    const raw = structuredClone(vectai);
    raw.sceneGraph.profile = { params: { exposure: 7 }, lights: { ambientIntensity: 7 } };
    raw.sceneGraph.viewerProfiles.r3fCurrent.params.visitorSpeed = 3;
    raw.sceneGraph.viewerProfiles.r3fCurrent.audioZones = [{ id: 'profile-only-audio', surfaces: ['unused'] }];
    raw.sceneGraph.viewerProfiles.r3fCurrent.lightZones = [{ id: 'profile-only-light', surfaces: ['unused'] }];
    raw.sceneGraph.sourceScene.renderer = { exposure: 1.8 };
    raw.sceneGraph.sourceScene.background = { color: '#123456', intensity: 1.3 };
    raw.sceneGraph.sourceScene.spawn = { node: 'Visitor_enter', position: [2, 3, 4] };
    const scene = await compileExhibitConfigV3(raw, undefined, () => undefined);
    expect(scene.params).toMatchObject({ exposure: 1.8, backgroundIntensity: 1.3, visitorEnter: [2, 3, 4], visitorSpeed: 3 });
    expect(scene.lights).toEqual(raw.sceneGraph.viewerProfiles.r3fCurrent.lights);
    expect(scene.audioZones).toHaveLength(2);
    expect(scene.lightZones).toHaveLength(2);
    expect(scene.audioZones?.some((zone) => zone.id === 'profile-only-audio')).toBe(false);
    expect(scene.lightZones?.some((zone) => zone.id === 'profile-only-light')).toBe(false);

    const nodeOverride = structuredClone(cipriani);
    nodeOverride.sceneGraph.nodes.ciprianiAudio.metadata.category = 'custom-audio-category';
    const overridden = await compileExhibitConfigV3(nodeOverride, undefined, () => undefined);
    expect(overridden.objects?.ciprianiAudio?.category).toBe('custom-audio-category');

    const audioOverride = structuredClone(cipriani);
    audioOverride.sceneGraph.viewerProfiles.r3fCurrent.audio = [{ id: 'ciprianiAudio', volume: 0.4, labelPlaying: 'Profile audio' }];
    const withViewerAudio = await compileExhibitConfigV3(audioOverride, undefined, () => undefined);
    expect(withViewerAudio.audio?.find((entry) => entry.id === 'ciprianiAudio')).toMatchObject({ volume: 0.4, labelPlaying: 'Profile audio', loop: true });
  });

  it('compiles About, links, icons and contextual media into one scene snapshot', async () => {
    withoutOptionalFetches();
    const snapshot = await compileExhibitSnapshot(lisbon, '/configs/lisbon.json', undefined, () => undefined);
    expect(snapshot.manifestUrl).toBe('/configs/lisbon.json');
    expect(snapshot.scene.id).toBe(lisbon.id);
    expect(snapshot.context.find((item) => item.id === 'info-icon')?.content).toContain('Living Heritage');
    expect(snapshot.context.some((item) => item.link?.startsWith('https://'))).toBe(true);
    expect(snapshot.context.some((item) => item.videoCandidates?.length)).toBe(true);
    expect(snapshot.context.find((item) => item.id === 'info-icon')?.icon).toContain('info.png');
    const documentContext = structuredClone(lisbon);
    documentContext.content.sidebar.items.push({ id: 'dossier', label: 'Dossier', contentMedia: 'curatorial_dossier' });
    const documentSnapshot = await compileExhibitSnapshot(documentContext, '/configs/document.json', undefined, () => undefined);
    expect(documentSnapshot.context.find((item) => item.id === 'dossier')?.pdfCandidates?.length).toBeGreaterThan(0);
    const fallback = structuredClone(lisbon);
    fallback.content.sidebar.items[0].content = undefined;
    fallback.content.sidebar.items[0].contentMedia = undefined;
    fallback.content.sidebar.items[0].target = undefined;
    const fallbackSnapshot = await compileExhibitSnapshot(fallback, '/configs/fallback.json', undefined, () => undefined);
    expect(fallbackSnapshot.context[0].content).toBe(fallback.metadata.description);
    const unsafe = structuredClone(lisbon);
    unsafe.content.sidebar.items.push({ id: 'unsafe', label: 'Unsafe', link: 'javascript:alert(1)' });
    const unsafeSnapshot = await compileExhibitSnapshot(unsafe, '/configs/unsafe.json', undefined, () => undefined);
    expect(unsafeSnapshot.context.find((item) => item.id === 'unsafe')?.link).toBeUndefined();
    const withoutActions = structuredClone(lisbon);
    delete withoutActions.content.sidebar;
    const noActionsSnapshot = await compileExhibitSnapshot(withoutActions, '/configs/no-actions.json', undefined, () => undefined);
    expect(noActionsSnapshot.context).toEqual([]);
  });

  it('rejects broken required references and retains shared candidate advancement', async () => {
    withoutOptionalFetches();
    const raw = structuredClone(cipriani);
    raw.sceneGraph.sourceScene.model.asset = 'missing-model';
    expect(() => validateRuntimeV3(raw)).toThrow('unknown asset');
    const candidates = runtimeAssetCandidates((await compileExhibitConfigV3(vectai, undefined, () => undefined)).modelAsset);
    const attempts: string[] = [];
    const loaded = await loadRuntimeAssetWithFallback(candidates, async (url) => {
      attempts.push(url);
      if (url === candidates[0]) throw new Error('Oracle unavailable');
      return url;
    });
    expect(loaded).toBe(candidates[1]);
    expect(attempts).toEqual(candidates.slice(0, 2));
    const posterAsset = (await compileExhibitConfigV3(vectai, undefined, () => undefined)).videos?.[0]?.posterAsset as RuntimeAsset;
    const posterAttempts: string[] = [];
    await loadRuntimeAssetWithFallback(runtimeAssetCandidates(posterAsset), async (url) => {
      posterAttempts.push(url);
      if (posterAttempts.length === 1) throw new Error('poster unavailable');
      return url;
    });
    expect(posterAttempts).toEqual(runtimeAssetCandidates(posterAsset).slice(0, 2));
  });

  it('keeps optional subtitle updates tied to their manifest and ignores aborted work', async () => {
    let completeFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { completeFetch = resolve; })));
    const controller = new AbortController();
    const updates: Array<{manifestUrl: string}> = [];
    const base = await compileExhibitSnapshot(vectai, '/configs/first.json', controller.signal, (update) => updates.push(update));
    expect(base.manifestUrl).toBe('/configs/first.json');
    controller.abort();
    completeFetch?.(new Response(JSON.stringify({ tracks: [{ language: 'en', cues: [{ start: 0, end: 1, text: 'Line' }] }] }), { status: 200 }));
    await Promise.resolve();
    await Promise.resolve();
    expect(updates).toHaveLength(0);

    withoutOptionalFetches();
    const current = await compileExhibitSnapshot(cipriani, '/configs/current.json', undefined, () => undefined);
    expect(current.manifestUrl).toBe('/configs/current.json');
    expect(current.context[0].id).toBe('info-icon');
    expect(current.scene.id).toBe('cipriani');
  });
});
