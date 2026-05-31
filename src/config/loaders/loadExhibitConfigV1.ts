import type { ExhibitConfig } from '../runtimeTypes';
import { normalizeConfig } from './shared';

export async function loadExhibitConfigV1(raw: unknown): Promise<ExhibitConfig> {
  return normalizeConfig((raw ?? {}) as ExhibitConfig);
}
