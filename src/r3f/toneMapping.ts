import {
  ACESFilmicToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  type WebGLRenderer
} from 'three';

const TONE_MAPPING_OPTIONS = [
  { value: 'neutral', label: 'Natural', toneMapping: NeutralToneMapping },
  { value: 'aces', label: 'ACES Filmic', toneMapping: ACESFilmicToneMapping },
  { value: 'cineon', label: 'Cineon', toneMapping: CineonToneMapping },
  { value: 'reinhard', label: 'Reinhard', toneMapping: ReinhardToneMapping },
  { value: 'linear', label: 'Linear', toneMapping: LinearToneMapping },
  { value: 'none', label: 'None', toneMapping: NoToneMapping }
] as const;

export type ToneMappingName = typeof TONE_MAPPING_OPTIONS[number]['value'];

export function normalizeToneMappingName(source: unknown): ToneMappingName {
  if (typeof source !== 'string') return 'neutral';
  const compact = source.trim().replace(/[\s_-]+/g, '').toLowerCase();
  if (compact === 'aces' || compact === 'acesfilmic') return 'aces';
  if (compact === 'cineon') return 'cineon';
  if (compact === 'reinhard') return 'reinhard';
  if (compact === 'linear') return 'linear';
  if (compact === 'none' || compact === 'no' || compact === 'notone') return 'none';
  if (compact === 'neutral' || compact === 'natural') return 'neutral';
  return 'neutral';
}

export function toneMappingValueForName(name: unknown): WebGLRenderer['toneMapping'] {
  const normalized = normalizeToneMappingName(name);
  return (TONE_MAPPING_OPTIONS.find((option) => option.value === normalized)?.toneMapping ?? NeutralToneMapping) as WebGLRenderer['toneMapping'];
}
