import { describe, expect, it } from 'vitest';
import { resolveAudioControlIds } from './audioMeshManager.ts';

describe('audio control targets', () => {
  it('keeps configured tracks addressable before their buffers finish loading', () => {
    const configuredIds = new Set(['ciprianiAudio_runtime']);

    expect(resolveAudioControlIds(configuredIds, null)).toEqual(['ciprianiAudio_runtime']);
  });

  it('keeps an explicitly empty spatial control route empty', () => {
    const configuredIds = new Set(['audio_left', 'audio_right']);

    expect(resolveAudioControlIds(configuredIds, new Set())).toEqual([]);
  });
});
