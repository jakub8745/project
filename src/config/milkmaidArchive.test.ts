import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import index from '../../archive/milkmaid_pitchers/audits/asset-index.json';
import manifest from '../../public/configs/milkmaid_pitchers_config_v3.json';
import { GALLERIES } from '../data/galleryConfig';
import { compileExhibitConfigV3 } from './loaders/compileExhibitConfigV3';
import { createWorldPositions, parseInfiniteWorld } from '../r3f/infiniteWorld';

describe('Milkmaid Pitchers archive authority', () => {
  it('indexes exactly the 199 selected pitcher identities and all scene dependencies', () => {
    const models = manifest.sceneGraph.proceduralRecipe.infiniteWorld.models;
    const assets = manifest.assets as Record<string, { id: string; kind: string; ipfsUri: string | null }>;
    const media = manifest.content.media as Record<string, Record<string, unknown>>;
    const nodes = manifest.sceneGraph.nodes as Record<string, Record<string, unknown>>;
    const modelIds = models.map((model) => model.id);

    expect(index.objects).toHaveLength(211); // broader source listing; not scene membership
    expect(models).toHaveLength(199);
    expect(new Set(modelIds).size).toBe(199);
    expect(Object.values(assets).filter((asset) => asset.kind === 'model')).toHaveLength(199);
    expect(Object.values(assets).filter((asset) => asset.kind === 'image')).toHaveLength(199);
    expect(manifest.sceneGraph.proceduralRecipe.infiniteWorld.activePopulation.count).toBe(199);

    for (const model of models) {
      const modelAsset = assets[model.asset];
      const thumbnailAsset = assets[model.thumbnailAsset];
      const modelCid = modelAsset.ipfsUri!.replace('ipfs://', '');
      const thumbnailCid = thumbnailAsset.ipfsUri!.replace('ipfs://', '');
      expect(modelAsset).toMatchObject({
        kind: 'model',
        ipfsUri: expect.stringMatching(/^ipfs:\/\//),
        fallbackUris: [`https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/milkmaid-pitchers/o/${modelCid}.glb`]
      });
      expect(thumbnailAsset).toMatchObject({
        kind: 'image',
        ipfsUri: expect.stringMatching(/^ipfs:\/\//),
        fallbackUris: [`https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/milkmaid-pitchers-thumbs/o/${thumbnailCid}.png`]
      });
      expect(media[model.id]).toMatchObject({
        kind: 'image',
        image: { asset: model.thumbnailAsset },
        metadata: { modelAsset: model.asset, attributes: expect.any(Array) }
      });
      expect(nodes[model.id]).toMatchObject({ kind: 'sculpture', ref: model.id, media: model.id, interactive: true });
    }
    expect(manifest.rights.defaultLicense).toBe('https://creativecommons.org/licenses/by/4.0/');
  });

  it('compiles the single V3 archive into the active field and preserves declared scene behavior', async () => {
    const altered = structuredClone(manifest);
    const world = altered.sceneGraph.proceduralRecipe.infiniteWorld;
    world.visitor.clearRadius = 4.5;
    world.visitor.walkingSpeed = 4.1;
    world.fog.end = 35;
    world.distribution.minSpacing = 1.5;
    world.scale.maximum = 1.1;
    world.recycling.radius = 42;

    const runtime = await compileExhibitConfigV3(altered);
    const config = runtime.infiniteWorld as Record<string, unknown>;
    const parsed = parseInfiniteWorld(config);
    expect(parsed).toMatchObject({
      clearRadius: 4.5,
      fogEnd: 35,
      fogColor: '#11100e',
      minSpacing: 1.5,
      maxScale: 1.1,
      recycleRadius: 42,
      visibleYawRadiansPerSecond: 0.12,
      floorVisible: true,
      backgroundColor: '#11100e'
    });
    expect(parsed?.minimumCandidateAttempts).toBe(1000);
    expect(parsed?.hiddenSafetyMarginMeters).toBe(2);
    expect(parsed?.destinationSearchDepthMeters).toBe(4);
    expect(runtime.params).toMatchObject({ visitorSpeed: 4.1 });
    expect(runtime.camera).toMatchObject({ fov: 60, near: 0.1, far: 120 });
    expect(runtime.params).toMatchObject({ toneMapping: 'neutral', exposure: 1.1, antialias: true, shadows: true });
    expect((config.lighting as Record<string, unknown>)?.visitorFollowSpotlight).toMatchObject({
      enabled: true,
      color: '#fff3dc',
      intensity: 70,
      rangeMeters: 36,
      castsShadows: false,
      aimDistanceMeters: 1
    });

    const runtimeModels = config.models as Array<{ id: string; path: string; collisionRadius: number; asset: { candidates: string[] } }>;
    expect(runtimeModels).toHaveLength(199);
    expect(runtimeModels.every((model) => model.path === model.asset.candidates[0])).toBe(true);
    expect(runtimeModels[0].path).toMatch(/^https:\/\/lrbcisjgkyhb\.objectstorage\.uk-london-1\.oci\.customer-oci\.com\/n\/lrbcisjgkyhb\/b\/milkmaid-pitchers\/o\/.+\.glb$/);
    expect(runtimeModels.every((model) => model.asset.candidates[0].includes('/b/milkmaid-pitchers/o/'))).toBe(true);
    expect(runtimeModels.every((model) => model.asset.candidates.some((candidate) => candidate.startsWith('https://ipfs.io/ipfs/')))).toBe(true);
    expect(runtimeModels.every((model) => model.collisionRadius === 0.7)).toBe(true);
    expect(Object.keys(runtime.images ?? {})).toHaveLength(199);
    const firstImage = runtime.images?.[runtimeModels[0].id] as { imageAsset?: { candidates: string[] } } | undefined;
    expect(firstImage?.imageAsset?.candidates.slice(0, 2)).toEqual([
      expect.stringMatching(/\/b\/milkmaid-pitchers-thumbs\/o\/.+\.png$/),
      expect.stringMatching(/^https:\/\/ipfs\.io\/ipfs\//)
    ]);
    expect(runtime.images?.[runtimeModels[0].id]).toMatchObject({
      attributes: expect.any(Array),
      license: { name: 'Creative Commons Attribution 4.0 International' }
    });

    const positions = createWorldPositions(199, parsed!, runtimeModels.map((model) => model.collisionRadius));
    expect(positions).toHaveLength(199);
    expect(positions.every(({ position: [x, , z], scale }, i) => Math.hypot(x, z) - runtimeModels[i].collisionRadius * scale >= 4.5)).toBe(true);
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const distance = Math.hypot(positions[i].position[0] - positions[j].position[0], positions[i].position[2] - positions[j].position[2]);
        const required = parsed!.minSpacing + runtimeModels[i].collisionRadius * positions[i].scale + runtimeModels[j].collisionRadius * positions[j].scale;
        expect(distance).toBeGreaterThanOrEqual(required);
      }
    }
  });

  it('registers the authoritative V3 manifest as the gallery scene', () => {
    expect(GALLERIES).toContainEqual(expect.objectContaining({
      slug: manifest.slug,
      configUrl: '/configs/milkmaid_pitchers_config_v3.json'
    }));
  });

  it('keeps asset identity and reconstruction intent independent of the current renderer', () => {
    expect(manifest.viewerBrief.reconstructionPrompt).toContain('framework-independent');
    expect(manifest.viewerBrief.prompts.sceneReconstruction).toContain('Use equivalent implementations');
    expect(manifest.viewerBrief.prompts.sceneReconstruction).toContain('199');
    expect(manifest.viewerBrief.reconstructionPriorities.join(' ')).not.toContain('Normalize');
    expect(manifest.sceneGraph.proceduralRecipe.infiniteWorld.seedSemantics).toContain('Draw yaw only after spacing passes');
    expect(manifest.interactions.find((entry) => entry.id === 'look-around')?.behavior.camera)
      .toBe('sceneGraph.proceduralRecipe.infiniteWorld.camera');
    expect(manifest.sceneGraph.proceduralRecipe.infiniteWorld.presentation).toMatchObject({ colorSpace: 'srgb' });

    const genericSources = [
      readFileSync(new URL('../r3f/InfiniteWorldScene.tsx', import.meta.url), 'utf8'),
      readFileSync(new URL('../r3f/infiniteWorld.ts', import.meta.url), 'utf8')
    ].join('\n');
    expect(genericSources).not.toMatch(/milkmaid|milkmaid-pitchers|lrbcisjgkyhb|objectstorage/);
  });
});
