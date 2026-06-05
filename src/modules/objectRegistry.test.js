import { describe, expect, it } from 'vitest';
import { normalizeObjectRegistry, resolveObjectRuntimeData } from './objectRegistry.js';

function object(name, userData = {}) {
  return { name, userData, parent: null };
}

describe('objectRegistry', () => {
  it('does not promote explicit wall meshes to video targets through video aliases', () => {
    const registry = normalizeObjectRegistry({
      echoes_video: {
        category: 'video',
        ref: 'echoes'
      }
    });

    const frame = resolveObjectRuntimeData(object('echoes', { type: 'Wall' }), registry);
    const plane = resolveObjectRuntimeData(
      object('echoes_video', { type: 'Video', name: 'echoes', elementID: 'echoes' }),
      registry
    );

    expect(frame).toMatchObject({
      type: 'Wall',
      ref: 'echoes',
      source: 'legacy'
    });
    expect(plane).toMatchObject({
      type: 'Video',
      ref: 'echoes',
      source: 'config'
    });
  });
});
