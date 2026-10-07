import type { Vector3Tuple } from 'three';

export interface InfiniteWorldConfig {
  seed: number;
  seedAlgorithm: 'mulberry32';
  recycleSeedXor: number;
  floorY: number;
  floorVisible: boolean;
  floorCollision: boolean;
  clearRadius: number;
  fogStart: number;
  fogEnd: number;
  fogColor: string;
  recycleRadius: number;
  placementRadius: number;
  minSpacing: number;
  density: number;
  candidateBudgetPerModel: number;
  minimumCandidateAttempts: number;
  minScale: number;
  maxScale: number;
  randomRotation: boolean;
  fixedPitch: number;
  fixedRoll: number;
  visibleYawRadiansPerSecond: number;
  recyclingEnabled: boolean;
  forwardBiasProbability: number;
  forwardBiasHalfAngleRadians: number;
  replacementYawIncrementRadians: number;
  maxReplacementsPerFrame: number;
  hiddenSafetyMarginMeters: number;
  destinationSearchDepthMeters: number;
  floorColor: string;
  backgroundColor: string;
  debug: boolean;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseInfiniteWorld(source: unknown): InfiniteWorldConfig | null {
  if (!source || typeof source !== 'object') return null;
  const value = source as Record<string, unknown>;
  const number = (key: string) => typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] as number : null;
  const fogStart = number('fogStart');
  const fogEnd = number('fogEnd');
  const seed = number('seed');
  const seedAlgorithm = value.seedAlgorithm;
  const recycleSeedXor = number('recycleSeedXor');
  const floorY = number('floorY');
  const floorVisible = typeof value.floorVisible === 'boolean' ? value.floorVisible : null;
  const floorCollision = typeof value.floorCollision === 'boolean' ? value.floorCollision : null;
  const clearRadius = number('clearRadius');
  const recycleRadius = number('recycleRadius');
  const placementRadius = number('placementRadius');
  const minSpacing = number('minSpacing');
  const density = number('density');
  const minScale = number('minScale');
  const maxScale = number('maxScale');
  const candidateBudgetPerModel = number('candidateBudgetPerModel');
  const minimumCandidateAttempts = number('minimumCandidateAttempts') ?? 1000;
  const fixedPitch = number('fixedPitch');
  const fixedRoll = number('fixedRoll');
  const visibleYawRadiansPerSecond = value.visibleYawRadiansPerSecond === undefined
    ? 0
    : number('visibleYawRadiansPerSecond');
  const recyclingEnabled = typeof value.recyclingEnabled === 'boolean' ? value.recyclingEnabled : null;
  const forwardBiasProbability = number('forwardBiasProbability');
  const forwardBiasHalfAngleRadians = number('forwardBiasHalfAngleRadians');
  const replacementYawIncrementRadians = number('replacementYawIncrementRadians');
  const maxReplacementsPerFrame = number('maxReplacementsPerFrame');
  const hiddenSafetyMarginMeters = number('hiddenSafetyMarginMeters') ?? 2;
  const destinationSearchDepthMeters = number('destinationSearchDepthMeters') ?? 4;
  if ([fogStart, fogEnd, seed, recycleSeedXor, floorY, clearRadius, recycleRadius, placementRadius, minSpacing, density, minScale, maxScale, candidateBudgetPerModel, fixedPitch, fixedRoll, visibleYawRadiansPerSecond, forwardBiasProbability, forwardBiasHalfAngleRadians, replacementYawIncrementRadians, maxReplacementsPerFrame].some((entry) => entry === null) || seedAlgorithm !== 'mulberry32' || floorVisible === null || floorCollision === null || recyclingEnabled === null || typeof value.floorColor !== 'string' || typeof value.backgroundColor !== 'string' || typeof value.randomRotation !== 'boolean') return null;
  if (fogStart! < 0 || fogEnd! <= fogStart! || clearRadius! <= 0 || recycleRadius! <= fogEnd! || placementRadius! <= clearRadius! || minSpacing! <= 0 || density! <= 0 || density! > 1 || candidateBudgetPerModel! < 1 || !Number.isInteger(minimumCandidateAttempts) || minimumCandidateAttempts < 1 || !Number.isInteger(maxReplacementsPerFrame) || maxReplacementsPerFrame! < 1 || !Number.isInteger(hiddenSafetyMarginMeters) || hiddenSafetyMarginMeters < 0 || destinationSearchDepthMeters < 0 || forwardBiasProbability! < 0 || forwardBiasProbability! > 1 || forwardBiasHalfAngleRadians! < 0 || forwardBiasHalfAngleRadians! > Math.PI || minScale! <= 0 || maxScale! < minScale!) return null;
  return {
    seed: seed!, seedAlgorithm, recycleSeedXor: recycleSeedXor!, floorY: floorY!, floorVisible, floorCollision, floorColor: value.floorColor, clearRadius: clearRadius!, fogStart: fogStart!, fogEnd: fogEnd!, fogColor: typeof value.fogColor === 'string' ? value.fogColor : value.backgroundColor, recycleRadius: recycleRadius!, placementRadius: placementRadius!,
    minSpacing: minSpacing!, density: density!, candidateBudgetPerModel: candidateBudgetPerModel!, minimumCandidateAttempts, minScale: minScale!, maxScale: maxScale!,
    randomRotation: value.randomRotation,
    fixedPitch: fixedPitch!, fixedRoll: fixedRoll!, visibleYawRadiansPerSecond: visibleYawRadiansPerSecond!, recyclingEnabled, maxReplacementsPerFrame: maxReplacementsPerFrame!,
    forwardBiasProbability: forwardBiasProbability!, forwardBiasHalfAngleRadians: forwardBiasHalfAngleRadians!, replacementYawIncrementRadians: replacementYawIncrementRadians!, hiddenSafetyMarginMeters, destinationSearchDepthMeters,
    backgroundColor: value.backgroundColor,
    debug: value.debug === true
  };
}

export function createWorldPositions(count: number, config: InfiniteWorldConfig, collisionRadii: number[] = []): Array<{ position: Vector3Tuple; rotation: Vector3Tuple; scale: number }> {
  const random = seededRandom(config.seed);
  const result: Array<{ position: Vector3Tuple; rotation: Vector3Tuple; scale: number }> = [];
  const attempts = Math.max(count * config.candidateBudgetPerModel, config.minimumCandidateAttempts);
  for (let i = 0; i < attempts && result.length < count; i += 1) {
    if (random() > config.density) continue;
    const scale = config.minScale + random() * (config.maxScale - config.minScale);
    const extent = Math.max(0, collisionRadii[result.length] || 0) * scale;
    const innerRadius = config.clearRadius + extent;
    const outerRadius = config.placementRadius - extent;
    if (outerRadius <= innerRadius) continue;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(innerRadius ** 2 + random() * (outerRadius ** 2 - innerRadius ** 2));
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (result.some((entry, index) => Math.hypot(entry.position[0] - x, entry.position[2] - z) < config.minSpacing + extent + Math.max(0, collisionRadii[index] || 0) * entry.scale)) continue;
    result.push({ position: [x, config.floorY, z], rotation: [config.fixedPitch, config.randomRotation ? random() * Math.PI * 2 : 0, config.fixedRoll],
      scale });
  }
  if (result.length !== count) throw new Error(`Infinite-world manifest cannot place ${count} models within its declared radius and clearance constraints (placed ${result.length}).`);
  return result;
}
