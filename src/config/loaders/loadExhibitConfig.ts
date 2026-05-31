import type { ExhibitConfig } from '../runtimeTypes';
import { loadExhibitConfigV1 } from './loadExhibitConfigV1';
import { loadExhibitConfigV2 } from './loadExhibitConfigV2';

export async function loadExhibitConfig(raw: unknown): Promise<ExhibitConfig> {
  const schemaVersion = raw && typeof raw === 'object' ? (raw as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (typeof schemaVersion === 'string' && schemaVersion.startsWith('2.')) {
    return loadExhibitConfigV2(raw);
  }
  return loadExhibitConfigV1(raw);
}
