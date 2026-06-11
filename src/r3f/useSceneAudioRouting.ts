import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  playAudioByIds,
  setAudioControlTargetIds,
  stopAudioByIds,
  type AudioMeshConfig,
  type AudioSubtitleCue,
  type AudioSubtitleTrack
} from '../modules/audioMeshManager.ts';
import type { ExhibitConfig } from './useExhibitConfig';
import type { AudioSubtitleLanguageOption } from './AudioPlayerControls';

export type AudioFloorRoute = {
  surfaces: string[];
  floors: string[];
  playAudioIds: string[];
  stopAudioIds: string[];
  controlAudioIds?: string[];
};

export function audioFloorRouteKey(route: AudioFloorRoute): string {
  return route.surfaces.join('|');
}

function coerceAudioDistanceModel(source: unknown): AudioMeshConfig['distanceModel'] {
  return source === 'linear' || source === 'inverse' || source === 'exponential' ? source : undefined;
}

function coerceStringList(source: unknown): string[] {
  if (Array.isArray(source)) {
    return source
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .map((value) => value.trim());
  }
  return typeof source === 'string' && source.trim() ? [source.trim()] : [];
}

function sanitizeSubtitleCues(source: unknown): AudioSubtitleCue[] | undefined {
  if (!Array.isArray(source)) {
    return undefined;
  }
  const cues = source
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const cue = entry as Record<string, unknown>;
      const start = typeof cue.start === 'number' ? cue.start : Number(cue.start);
      const end = typeof cue.end === 'number' ? cue.end : Number(cue.end);
      const text = typeof cue.text === 'string' ? cue.text.trim() : '';
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
        return null;
      }
      return { start: Math.max(0, start), end, text } satisfies AudioSubtitleCue;
    })
    .filter((cue): cue is AudioSubtitleCue => cue !== null)
    .sort((left, right) => left.start - right.start);
  return cues.length > 0 ? cues : undefined;
}

function sanitizeSubtitleLanguage(source: unknown): string | undefined {
  return typeof source === 'string' && source.trim() ? source.trim().toLowerCase() : undefined;
}

function sanitizeAudioSubtitleTracks(record: Record<string, unknown>): AudioSubtitleTrack[] | undefined {
  const parsedTracks = Array.isArray(record.subtitleTracks)
    ? record.subtitleTracks
        .map((entry): AudioSubtitleTrack | null => {
          if (!entry || typeof entry !== 'object') return null;
          const track = entry as Record<string, unknown>;
          const language = sanitizeSubtitleLanguage(track.language);
          const cues = sanitizeSubtitleCues(track.cues);
          if (!language || !cues) return null;
          return {
            language,
            label: typeof track.label === 'string' && track.label.trim() ? track.label.trim() : undefined,
            cues
          } satisfies AudioSubtitleTrack;
        })
        .filter((track): track is AudioSubtitleTrack => track !== null)
    : [];
  const legacyCues = sanitizeSubtitleCues(record.subtitles);
  if (legacyCues) {
    const language = sanitizeSubtitleLanguage(record.subtitleLanguage) ?? 'en';
    parsedTracks.push({
      language,
      label: language.toUpperCase(),
      cues: legacyCues
    });
  }
  return parsedTracks.length > 0 ? parsedTracks : undefined;
}

export function parseAudioConfig(config: ExhibitConfig | null): AudioMeshConfig[] | undefined {
  if (!Array.isArray(config?.audio)) return undefined;
  const sanitized = config.audio
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === 'string'
        ? record.id
        : typeof record.name === 'string'
          ? record.name
          : undefined;
      if (!id) return null;
      const url = typeof record.url === 'string' ? record.url : undefined;
      const ipfsUrl = typeof record.ipfsUrl === 'string' ? record.ipfsUrl : undefined;
      if (!url && !ipfsUrl) return null;
      const subtitleTracks = sanitizeAudioSubtitleTracks(record);
      let directionalCone: [number, number, number] | undefined;
      if (Array.isArray(record.directionalCone)) {
        const cone = (record.directionalCone as unknown[])
          .slice(0, 3)
          .map((value) => (typeof value === 'number' ? value : Number(value)))
          .filter((value) => Number.isFinite(value)) as number[];
        if (cone.length === 3) {
          directionalCone = [cone[0], cone[1], cone[2]];
        }
      }
      let coneTarget: [number, number, number] | undefined;
      if (Array.isArray(record.coneTarget)) {
        const target = (record.coneTarget as unknown[])
          .slice(0, 3)
          .map((value) => (typeof value === 'number' ? value : Number(value)))
          .filter((value) => Number.isFinite(value)) as number[];
        if (target.length === 3) {
          coneTarget = [target[0], target[1], target[2]];
        }
      }
      const sanitized: AudioMeshConfig = {
        id,
        name: typeof record.name === 'string' ? record.name : undefined,
        url,
        ipfsUrl,
        autoplayOnEnter: typeof record.autoplayOnEnter === 'boolean' ? record.autoplayOnEnter : undefined,
        autoplayDelayMs: typeof record.autoplayDelayMs === 'number'
          ? record.autoplayDelayMs
          : typeof record.autoplayDelaySeconds === 'number'
            ? record.autoplayDelaySeconds * 1000
            : undefined,
        labelPlaying: typeof record.labelPlaying === 'string' ? record.labelPlaying : undefined,
        labelPaused: typeof record.labelPaused === 'string' ? record.labelPaused : undefined,
        loop: typeof record.loop === 'boolean' ? record.loop : undefined,
        refDistance: typeof record.refDistance === 'number' ? record.refDistance : undefined,
        rolloff: typeof record.rolloff === 'number' ? record.rolloff : undefined,
        maxDistance: typeof record.maxDistance === 'number' ? record.maxDistance : undefined,
        distanceModel: coerceAudioDistanceModel(record.distanceModel),
        volume: typeof record.volume === 'number' ? record.volume : undefined,
        directionalCone,
        coneTarget,
        startOffset: typeof record.startOffset === 'number' ? record.startOffset : undefined,
        reverse: typeof record.reverse === 'boolean' ? record.reverse : undefined,
        subtitleOffsetMs: typeof record.subtitleOffsetMs === 'number' ? record.subtitleOffsetMs : undefined,
        subtitleOffsetSeconds:
          typeof record.subtitleOffsetSeconds === 'number' ? record.subtitleOffsetSeconds : undefined,
        transformControls:
          typeof record.transformControls === 'boolean'
            ? record.transformControls
            : record.transformControls && typeof record.transformControls === 'object' && !Array.isArray(record.transformControls)
              ? record.transformControls as AudioMeshConfig['transformControls']
              : undefined,
        subtitleTracks
      };
      return sanitized;
    })
    .filter((cfg): cfg is AudioMeshConfig => cfg !== null);
  return sanitized.length ? sanitized : undefined;
}

export function parseAudioFloorRoutes(config: ExhibitConfig | null): AudioFloorRoute[] {
  if (!Array.isArray(config?.audioZones)) {
    return [];
  }
  return config.audioZones
    .map((entry): AudioFloorRoute | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const floors = [
        ...coerceStringList(record.surface),
        ...coerceStringList(record.surfaces),
        ...coerceStringList(record.object),
        ...coerceStringList(record.objects),
        ...coerceStringList(record.floor),
        ...coerceStringList(record.floors)
      ];
      if (floors.length === 0) return null;
      const playAudioIds = [
        ...coerceStringList(record.playAudioId),
        ...coerceStringList(record.playAudioIds),
        ...coerceStringList(record.startAudioId),
        ...coerceStringList(record.startAudioIds)
      ];
      const stopAudioIds = [
        ...coerceStringList(record.stopAudioId),
        ...coerceStringList(record.stopAudioIds)
      ];
      const controlAudioIds = 'controlAudioIds' in record || 'controlAudioId' in record
        ? [
            ...coerceStringList(record.controlAudioId),
            ...coerceStringList(record.controlAudioIds)
          ]
        : undefined;
      return { surfaces: floors, floors, playAudioIds, stopAudioIds, controlAudioIds };
    })
    .filter((route): route is AudioFloorRoute => route !== null);
}

export function useSceneAudioRouting(config: ExhibitConfig | null) {
  const audioConfig = useMemo(() => parseAudioConfig(config), [config]);

  const audioControlLabels = useMemo(() => {
    if (!Array.isArray(audioConfig) || audioConfig.length === 0) {
      return undefined;
    }
    const labelSource = audioConfig.find(
      (entry) => typeof entry.labelPlaying === 'string' || typeof entry.labelPaused === 'string'
    );
    if (!labelSource) return undefined;
    return {
      labelPlaying: typeof labelSource.labelPlaying === 'string' && labelSource.labelPlaying.trim()
        ? labelSource.labelPlaying
        : undefined,
      labelPaused: typeof labelSource.labelPaused === 'string' && labelSource.labelPaused.trim()
        ? labelSource.labelPaused
        : undefined
    };
  }, [audioConfig]);

  const xrIntroAudioIds = useMemo(() => {
    if (!Array.isArray(audioConfig) || audioConfig.length === 0) {
      return [];
    }
    return audioConfig
      .filter((entry) => {
        const searchable = [
          entry.id,
          entry.name,
          entry.labelPlaying,
          entry.labelPaused
        ]
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
          .toLowerCase();
        return searchable.includes('intro');
      })
      .map((entry) => entry.id);
  }, [audioConfig]);

  const subtitleLanguageOptions = useMemo<AudioSubtitleLanguageOption[]>(() => {
    const options = new Map<string, AudioSubtitleLanguageOption>();
    audioConfig?.forEach((audio) => {
      audio.subtitleTracks?.forEach((track) => {
        if (options.has(track.language)) return;
        options.set(track.language, {
          value: track.language,
          label: track.label || track.language.toUpperCase()
        });
      });
    });
    return Array.from(options.values());
  }, [audioConfig]);
  const [subtitleLanguage, setSubtitleLanguage] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (subtitleLanguageOptions.length === 0) {
      if (subtitleLanguage !== undefined) {
        setSubtitleLanguage(undefined);
      }
      return;
    }
    if (subtitleLanguage === undefined) {
      setSubtitleLanguage(subtitleLanguageOptions[0].value);
      return;
    }
    if (subtitleLanguage !== null && !subtitleLanguageOptions.some((option) => option.value === subtitleLanguage)) {
      setSubtitleLanguage(subtitleLanguageOptions[0].value);
    }
  }, [subtitleLanguage, subtitleLanguageOptions]);

  const audioFloorRoutes = useMemo(() => parseAudioFloorRoutes(config), [config]);

  const applyAudioFloorRoute = useCallback((route: AudioFloorRoute) => {
    if (route.stopAudioIds.length > 0) {
      stopAudioByIds(route.stopAudioIds);
    }
    if (route.controlAudioIds !== undefined) {
      setAudioControlTargetIds(route.controlAudioIds);
    }
    if (route.playAudioIds.length > 0) {
      void playAudioByIds(route.playAudioIds);
    }
  }, []);

  return {
    audioConfig,
    audioControlLabels,
    xrIntroAudioIds,
    subtitleLanguageOptions,
    subtitleLanguage,
    setSubtitleLanguage,
    audioFloorRoutes,
    applyAudioFloorRoute
  };
}
