import { describe, expect, it } from 'vitest';
import vectaiV3 from '../../../public/configs/vectai_krakow_032026_config_v3.json';
import { compileExhibitConfigV3 } from './compileExhibitConfigV3';
import { parseAudioFloorRoutes } from '../../r3f/useSceneAudioRouting';
import { parseLightZoneRoutes } from '../../r3f/useSceneLightZones';
import { runtimeAssetCandidates, type RuntimeAsset } from '../assetResolution';

const ORACLE_PREFIX = 'https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/';

describe('V3 native runtime behavior', () => {
  it('uses Oracle fallbacks before canonical IPFS URIs', async () => {
    const config = await compileExhibitConfigV3(vectaiV3);
    expect(config.modelPath).toMatch(/^https:\/\/lrbcisjgkyhb\.objectstorage\./);
    expect(runtimeAssetCandidates(config.images?.image_tablica?.imageAsset as RuntimeAsset)[0]).toMatch(new RegExp(`^${ORACLE_PREFIX}`));
    const firstVideo = config.videos?.[0] as Record<string, unknown> | undefined;
    const firstSource = Array.isArray(firstVideo?.sources) ? firstVideo.sources[0] as Record<string, unknown> : undefined;
    expect(firstSource?.src).toMatch(new RegExp(`^${ORACLE_PREFIX}`));
    expect(config.audio?.[0]?.url).toMatch(new RegExp(`^${ORACLE_PREFIX}`));
  });

  it('does not expose moved local procedural asset paths', async () => {
    const config = await compileExhibitConfigV3(vectaiV3);
    const modelPaths = (config.models || []).map((model) => model.path);
    expect(modelPaths.every((path) => typeof path === 'string' && path.startsWith(ORACLE_PREFIX))).toBe(true);
  });

  it('uses portable VECT_AI zone behavior when it conflicts with the current R3F profile', async () => {
    const config = await compileExhibitConfigV3(vectaiV3, undefined, () => undefined);
    const mainRoomLight = parseLightZoneRoutes(config).find((route) => route.id === 'main_room_light');

    expect(mainRoomLight?.lights?.ambientIntensity).toBe(0.65);
    expect(mainRoomLight?.params?.toneMapping).toBe('aces');
    expect(mainRoomLight?.params?.exposure).toBe(1.24);
    expect(mainRoomLight?.params?.exposureTarget).toBe(0.83);
    expect(parseAudioFloorRoutes(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        floors: ['floor_ucieta', 'walls_main'],
        playAudioIds: ['audio_left', 'audio_right'],
        stopAudioIds: ['audio_intro']
      })
    ]));
  });

  it('keeps portable renderer, spawn, and background values ahead of viewer-profile defaults', async () => {
    const config = await compileExhibitConfigV3({
      schemaVersion: '3.0.0-draft',
      manifestType: 'future-proof-exhibit-archive',
      profile: 'portable-exhibit',
      id: 'authority-fixture',
      metadata: { title: 'Authority fixture', description: '' },
      assets: { model: { sourceUri: '/model.glb', ipfsUri: null, mimeType: 'model/gltf-binary' } },
      content: { media: {}, sidebar: {} },
      sceneGraph: {
        sourceScene: {
          model: { asset: 'model' },
          spawn: { position: [1, 2, 3], direction: 'west' },
          background: { color: '#000000', blurriness: 0.2, intensity: 0.4 },
          renderer: { toneMapping: 'cineon', exposure: 0.9, maxDpr: 1 }
        },
        nodes: {},
        viewerProfiles: {
          r3fCurrent: {
            params: {
              visitorEnter: [9, 9, 9],
              spawnDirection: 'east',
              toneMapping: 'aces',
              exposure: 1.7,
              maxDpr: 2,
              backgroundBlurriness: 0,
              backgroundIntensity: 1,
              visitorSpeed: 3
            }
          }
        }
      },
      interactions: [],
      viewerBrief: { purpose: '', requiredCapabilities: [], reconstructionPrompt: '' },
      preservation: { futureProofDefinition: '', requiredBeforeMinting: [] }
    });

    expect(config.params).toMatchObject({
      visitorEnter: [1, 2, 3],
      spawnDirection: 'west',
      toneMapping: 'cineon',
      exposure: 0.9,
      maxDpr: 1,
      backgroundBlurriness: 0.2,
      backgroundIntensity: 0.4,
      visitorSpeed: 3
    });
  });
});
