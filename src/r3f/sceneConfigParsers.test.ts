import { describe, expect, it } from 'vitest';
import type { ExhibitConfig } from './useExhibitConfig';
import { parseAudioConfig, parseAudioFloorRoutes } from './useSceneAudioRouting';
import { parseLightZoneRoutes } from './useSceneLightZones';
import { parseSceneVideoConfig } from './useSceneVideoConfig';

describe('scene config parser hooks', () => {
  it('normalizes audio entries, subtitle tracks, and floor routes', () => {
    const config = {
      audio: [
        {
          id: 'intro_audio',
          url: '/audio/intro.mp3',
          labelPlaying: 'Pause intro',
          distanceModel: 'linear',
          directionalCone: [45, '90', 0.2],
          subtitles: [
            { start: 1, end: 2, text: ' Hello ' },
            { start: 'bad', end: 3, text: 'ignored' }
          ],
          subtitleLanguage: 'EN'
        },
        { id: 'invalid_audio' }
      ],
      audioZones: [
        {
          surface: 'FloorA',
          startAudioIds: ['intro_audio'],
          stopAudioId: 'other_audio',
          controlAudioId: 'intro_audio'
        }
      ]
    } as ExhibitConfig;

    const audio = parseAudioConfig(config);
    expect(audio).toHaveLength(1);
    expect(audio?.[0]).toMatchObject({
      id: 'intro_audio',
      url: '/audio/intro.mp3',
      distanceModel: 'linear',
      directionalCone: [45, 90, 0.2]
    });
    expect(audio?.[0].subtitleTracks?.[0]).toMatchObject({
      language: 'en',
      label: 'EN',
      cues: [{ start: 1, end: 2, text: 'Hello' }]
    });

    expect(parseAudioFloorRoutes(config)).toEqual([
      {
        surfaces: ['FloorA'],
        floors: ['FloorA'],
        playAudioIds: ['intro_audio'],
        stopAudioIds: ['other_audio'],
        controlAudioIds: ['intro_audio']
      }
    ]);
  });

  it('normalizes light zones and exposure params', () => {
    const routes = parseLightZoneRoutes({
      lightZones: [
        {
          id: 'zone-a',
          surfaces: ['FloorA', 'WallA'],
          lights: { ambientIntensity: 0.4 },
          params: { autoExposure: false },
          exposure: { value: 1.3, min: 0.8 },
          transitionMs: 500
        }
      ]
    } as ExhibitConfig);

    expect(routes).toEqual([
      {
        id: 'zone-a',
        surfaces: ['FloorA', 'WallA'],
        lights: { ambientIntensity: 0.4 },
        params: {
          autoExposure: false,
          exposure: 1.3,
          exposureMin: 0.8
        },
        transitionSeconds: 0.5
      }
    ]);
  });

  it('normalizes video mesh config and ignores invalid entries', () => {
    const videos = parseSceneVideoConfig({
      videos: [
        {
          id: 'video_a',
          sources: [
            { src: '/videos/a.mp4', type: 'video/mp4', ipfsSrc: 'ipfs://a' },
            { type: 'video/mp4' }
          ],
          videoSurface: {
            roughness: 0.25,
            projection: true,
            emissiveColor: '#ffffff'
          },
          autoplayOnEnter: true,
          playbackMode: 'modal',
          poster: '/poster.jpg'
        },
        { id: 'missing_sources' }
      ]
    } as ExhibitConfig);

    expect(videos).toHaveLength(1);
    expect(videos?.[0]).toMatchObject({
      id: 'video_a',
      sources: [{ src: '/videos/a.mp4', type: 'video/mp4', ipfsSrc: 'ipfs://a' }],
      videoSurface: {
        roughness: 0.25,
        projection: true,
        emissiveColor: '#ffffff'
      },
      autoplayOnEnter: true,
      playbackMode: 'direct_modal',
      poster: '/poster.jpg'
    });
  });
});
