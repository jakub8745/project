import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadExhibitConfigV2 } from './loadExhibitConfigV2';

describe('loadExhibitConfigV2', () => {
  it('maps scene spawn settings into runtime visitor params and enter node metadata', async () => {
    const config = await loadExhibitConfigV2({
      schemaVersion: '2.0.0',
      id: 'spawn-test',
      kind: 'exhibit',
      metadata: {
        title: 'Spawn Test',
        description: 'Fixture'
      },
      assets: {
        scene_model: {
          kind: 'model',
          uri: '/models/test.glb',
          mimeType: 'model/gltf-binary'
        }
      },
      scene: {
        model: {
          asset: 'scene_model'
        },
        spawn: {
          node: 'SpawnAnchor',
          position: [1, 2, 3],
          direction: 'west'
        },
        renderer: {
          maxDpr: 1
        }
      },
      nodes: {
        SpawnAnchor: {
          kind: 'generic',
          ref: 'SpawnEmpty'
        },
        FloorMesh: {
          kind: 'floor',
          ref: 'FloorMesh'
        }
      }
    });

    expect(config.modelPath).toBe('/models/test.glb');
    expect(config.params).toMatchObject({
      visitorEnter: [1, 2, 3],
      spawnDirection: 'west',
      maxDpr: 1
    });
    expect(config.objects?.SpawnAnchor).toMatchObject({
      category: 'enter',
      ref: 'SpawnEmpty',
      spawnDirection: 'west'
    });
    expect(config.objects?.FloorMesh).toMatchObject({
      category: 'floor',
      ref: 'FloorMesh'
    });
  });

  it('lets viewer params override scene spawn params during compatibility normalization', async () => {
    const config = await loadExhibitConfigV2({
      schemaVersion: '2.0.0',
      id: 'viewer-override-test',
      kind: 'exhibit',
      metadata: {
        title: 'Viewer Override Test',
        description: 'Fixture'
      },
      assets: {
        scene_model: {
          kind: 'model',
          uri: '/models/test.glb',
          mimeType: 'model/gltf-binary'
        }
      },
      scene: {
        model: {
          asset: 'scene_model'
        },
        spawn: {
          position: [1, 2, 3],
          direction: 'west'
        }
      },
      nodes: {},
      viewer: {
        params: {
          visitorEnter: [4, 5, 6],
          spawnDirection: 'east',
          visitorSpeed: 2
        }
      }
    });

    expect(config.params).toMatchObject({
      visitorEnter: [4, 5, 6],
      spawnDirection: 'east',
      visitorSpeed: 2
    });
  });

  it.each([
    'tom_exhibit_config.json',
    'bednarczyk_config.json',
    'dystopia_config.json',
    'prompt_procedural_room_config.json',
    'lockdowns_config.json',
    'identity_config.json',
    'wakeup_config.json',
    'cipriani_config.json',
    'vectai_krakow_032026_config_v2.json',
    'videopoem_lisbon_112025_config_v2.json'
  ])('loads migrated v2 config %s', async (filename) => {
    const rawText = readFileSync(resolve(process.cwd(), 'public/configs', filename), 'utf8');
    const raw = JSON.parse(rawText) as Record<string, unknown>;
    expect(raw.schemaVersion).toBe('2.0.0');

    const config = await loadExhibitConfigV2(raw);
    expect(config.metadata).toBeTruthy();

    if (filename === 'prompt_procedural_room_config.json') {
      expect(config.modelPath).toBeUndefined();
      expect(config.proceduralRoom).toBeTruthy();
      expect(config.chat).toMatchObject({ enabled: true });
      expect(config.thumbnailCapture).toMatchObject({ enabled: true });
    } else if (filename === 'identity_config.json') {
      expect(config.modelPath).toBe('/models/exhibition_identity_merged.glb');
      expect(config.videos).toHaveLength(2);
      expect(config.videos?.every((video) => video.playbackMode === 'synced_silent')).toBe(true);
    } else if (filename === 'wakeup_config.json') {
      expect(config.modelPath).toBe('/models/exhibition_wakeupcall_merged.glb');
      expect(Object.keys(config.images || {})).toHaveLength(13);
    } else if (filename === 'cipriani_config.json') {
      expect(config.modelPath).toBe('/models/exhibition_cipriani_merged.glb');
      expect(Object.keys(config.images || {})).toHaveLength(40);
      expect(config.audio).toHaveLength(1);
      expect(config.objects?.cipriani_opis).toMatchObject({
        category: 'image',
        visible: false,
        interactive: true
      });
    } else if (filename === 'bednarczyk_config.json') {
      expect(config.objects?.logo_oficyny).toMatchObject({
        category: 'link'
      });
      expect(config.objects?.logo_oficyny?.visible).toBeUndefined();
    } else if (filename === 'vectai_krakow_032026_config_v2.json') {
      expect(config.modelPath).toBe('/models/vectai_room.glb');
      expect(config.videos).toHaveLength(3);
    } else if (filename === 'videopoem_lisbon_112025_config_v2.json') {
      expect(config.modelPath).toBe('/models/exhibition_videopoems_low.glb');
      expect(config.videos).toHaveLength(3);
    } else {
      expect(config.modelPath).toBeTruthy();
    }
  });
});
