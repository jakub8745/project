import type { ExhibitConfig } from '../runtimeTypes';
import { normalizeManifestShape } from '../manifestShape';
import { loadExhibitConfigV2 } from './loadExhibitConfigV2';

export const adaptExhibitConfigV3 = normalizeManifestShape;

export async function loadExhibitConfigV3(
  raw: unknown,
  signal?: AbortSignal,
  onOptionalUpdate?: (config: ExhibitConfig) => void
): Promise<ExhibitConfig> {
  return loadExhibitConfigV2(adaptExhibitConfigV3(raw), signal, onOptionalUpdate);
}
