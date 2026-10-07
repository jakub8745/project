import { describe, expect, it } from 'vitest';
import { createWorldPositions, parseInfiniteWorld } from './infiniteWorld';

describe('manifest driven infinite world placement', () => {
  const config = parseInfiniteWorld({ seed: 2, seedAlgorithm: 'mulberry32', recycleSeedXor: 0x6d2b79f5, floorY: 0, floorVisible: false, floorCollision: true, floorColor: '#111827', clearRadius: 12, fogStart: 20, fogEnd: 30, recycleRadius: 45, placementRadius: 60, minSpacing: 3, density: 1, candidateBudgetPerModel: 2000, minScale: 0.75, maxScale: 1.25, randomRotation: true, fixedPitch: 0, fixedRoll: 0, recyclingEnabled: true, maxReplacementsPerFrame: 1, forwardBiasProbability: 0.65, forwardBiasHalfAngleRadians: Math.PI / 2, replacementYawIncrementRadians: 0.71, backgroundColor: '#111827' })!;

  it('places reproducibly for a configured seed and keeps objects out of spawn space', () => {
    const first = createWorldPositions(40, config);
    expect(createWorldPositions(40, config)).toEqual(first);
    expect(first.every(({ position: [x, , z] }) => Math.hypot(x, z) >= 3 * 1.8)).toBe(true);
  });

  it('keeps recycle space beyond the fully fogged distance', () => {
    expect(config.recycleRadius).toBeGreaterThan(config.fogEnd);
    expect(config.fogEnd).toBeGreaterThan(config.fogStart);
  });

  it('returns null for manifests that do not opt in', () => {
    expect(parseInfiniteWorld(undefined)).toBeNull();
  });
});
