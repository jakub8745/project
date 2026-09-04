import type { ExhibitConfig } from '../runtimeTypes';
import { loadExhibitConfigV2 } from './loadExhibitConfigV2';

export async function loadExhibitConfig(
  raw: unknown,
  signal?: AbortSignal,
  onOptionalUpdate?: (config: ExhibitConfig) => void
): Promise<ExhibitConfig> {
  const schemaVersion = raw && typeof raw === 'object' ? (raw as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (typeof schemaVersion !== 'string' || !schemaVersion.startsWith('2.')) {
    throw new Error('Unsupported exhibit config schema. Expected schemaVersion 2.x.');
  }
  return loadExhibitConfigV2(raw, signal, onOptionalUpdate);
}
