import type { ExhibitConfigV3 } from '../types/exhibitSchemaV3';
import { compileContextualActions, type InfoItem } from './contextualActions';
import type { ExhibitConfig } from './runtimeTypes';
import { compileExhibitConfigV3, validateRuntimeV3 } from './loaders/compileExhibitConfigV3';

export interface CompiledExhibitSnapshot {
  manifestUrl: string;
  scene: ExhibitConfig;
  context: InfoItem[];
}

/** The selected V3 manifest produces one scene/context revision. */
export async function compileExhibitSnapshot(
  raw: unknown,
  manifestUrl: string,
  signal?: AbortSignal,
  onOptionalUpdate?: (snapshot: CompiledExhibitSnapshot) => void
): Promise<CompiledExhibitSnapshot> {
  const version = raw && typeof raw === 'object' ? (raw as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (typeof version !== 'string') throw new Error('Invalid exhibit config: schemaVersion is required.');

  if (!version.startsWith('3.')) throw new Error('Unsupported exhibit config schema. Expected schemaVersion 3.x.');
  const manifest = validateRuntimeV3(raw) as ExhibitConfigV3;
  const context: InfoItem[] = compileContextualActions({
    metadata: manifest.metadata,
    assets: manifest.assets,
    media: manifest.content.media,
    sidebar: manifest.content.sidebar
  });

  const withScene = (scene: ExhibitConfig): CompiledExhibitSnapshot => ({ manifestUrl, scene, context });
  const scene = await compileExhibitConfigV3(manifest, signal, onOptionalUpdate ? (updated) => onOptionalUpdate(withScene(updated)) : undefined);
  return withScene(scene);
}
