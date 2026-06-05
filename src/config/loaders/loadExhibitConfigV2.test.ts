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

  it('lets viewer params override scene renderer defaults during compatibility normalization', async () => {
    const config = await loadExhibitConfigV2({
      schemaVersion: '2.0.0',
      id: 'renderer-override-test',
      kind: 'exhibit',
      metadata: {
        title: 'Renderer Override Test',
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
        renderer: {
          toneMapping: 'neutral',
          exposure: 1
        }
      },
      nodes: {},
      viewer: {
        params: {
          toneMapping: 'cineon'
        }
      }
    });

    expect(config.params).toMatchObject({
      toneMapping: 'cineon',
      exposure: 1
    });
  });

  it('keeps generated subtitle tracks when legacy viewer audio overrides a v2 audio module', async () => {
    const subtitleAsset = encodeURIComponent(JSON.stringify({
      tracks: [
        {
          language: 'en',
          label: 'EN',
          cues: [{ start: 0, end: 1, text: 'Hello' }]
        },
        {
          language: 'pl',
          label: 'PL',
          cues: [{ start: 0, end: 1, text: 'Czesc' }]
        }
      ]
    }));

    const config = await loadExhibitConfigV2({
      schemaVersion: '2.0.0',
      id: 'audio-merge-test',
      kind: 'exhibit',
      metadata: {
        title: 'Audio Merge Test',
        description: 'Fixture'
      },
      assets: {
        scene_model: {
          kind: 'model',
          uri: '/models/test.glb',
          mimeType: 'model/gltf-binary'
        },
        intro_audio: {
          kind: 'audio',
          uri: '/audio/intro.mp3',
          mimeType: 'audio/mpeg'
        },
        intro_subtitles: {
          kind: 'subtitle',
          uri: `data:application/json,${subtitleAsset}`,
          mimeType: 'application/json'
        }
      },
      scene: {
        model: {
          asset: 'scene_model'
        }
      },
      nodes: {
        introduction_audio: {
          kind: 'audio_anchor',
          ref: 'introduction_audio'
        }
      },
      media: {
        introduction_audio_media: {
          kind: 'audio',
          title: 'introduction_audio',
          sources: [{ asset: 'intro_audio' }],
          subtitles: ['intro_subtitles']
        }
      },
      modules: {
        audio: {
          instances: [
            {
              id: 'introduction_audio_module',
              targetNode: 'introduction_audio',
              media: 'introduction_audio_media',
              labelPaused: 'Play Intro'
            }
          ]
        }
      },
      viewer: {
        audio: [
          {
            id: 'introduction_audio',
            labelPaused: 'Legacy Play Intro',
            volume: 0.5
          }
        ]
      }
    });

    expect(config.audio?.[0]).toMatchObject({
      id: 'introduction_audio',
      labelPaused: 'Legacy Play Intro',
      volume: 0.5
    });
    expect(config.audio?.[0]?.subtitleTracks).toHaveLength(2);
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
      expect(config.images?.pdf_manual_pl).toMatchObject({
        tooltipLabel: 'PDF/Zenodo: workshop manual (PL)',
        pdfOpenPath: 'https://zenodo.org/records/19220100',
        pdfOpenLabel: '*Cracks of Meaning* — full methodological publication'
      });
      expect(config.images?.pdf_manual_en).toMatchObject({
        tooltipLabel: 'PDF: manual summary (ENG)',
        pdfOpenLabel: 'PDF: *Cracks of Meaning* — summary (ENG)'
      });
      expect(config.objects?.floor_ucieta).toMatchObject({
        category: 'floor'
      });
      expect(config.objects?.floor_ucieta?.tooltipLabel).toBeUndefined();
      expect(config.objects?.walls_main).toMatchObject({
        category: 'walls',
        tooltipLabel: expect.stringContaining('Final immersive three-screen videopoem')
      });
    } else if (filename === 'videopoem_lisbon_112025_config_v2.json') {
      expect(config.modelPath).toBe('/models/exhibition_videopoems_low.glb');
      expect(config.videos).toHaveLength(3);
    } else {
      expect(config.modelPath).toBeTruthy();
    }
  });
});
