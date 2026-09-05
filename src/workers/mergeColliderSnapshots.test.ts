import { describe, expect, it } from 'vitest';
import { mergeColliderSnapshots } from './mergeColliderSnapshots';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('mergeColliderSnapshots', () => {
  it('transforms vertices and offsets indices across meshes', () => {
    const result = mergeColliderSnapshots([
      {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
        matrices: [identity]
      },
      {
        positions: new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 1]),
        indices: null,
        matrices: [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 2, -1, 1]]
      }
    ]);

    expect(Array.from(result.positions)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      5, 2, -1, 5, 3, -1, 5, 2, 0
    ]);
    expect(Array.from(result.indices)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('rejects an empty collider', () => {
    expect(() => mergeColliderSnapshots([])).toThrow('No triangle geometry');
  });

  it('expands instanced geometry using each world matrix', () => {
    const result = mergeColliderSnapshots([{
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      matrices: [
        identity,
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]
      ]
    }]);

    expect(Array.from(result.positions.slice(9))).toEqual([10, 0, 0, 11, 0, 0, 10, 1, 0]);
    expect(Array.from(result.indices)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
