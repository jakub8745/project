import type { ExhibitConfig } from '../runtimeTypes';
import { loadExhibitConfigV2 } from './loadExhibitConfigV2';
import { loadExhibitConfigV3 } from './loadExhibitConfigV3';

export async function loadExhibitConfig(
  raw: unknown,
  signal?: AbortSignal,
  onOptionalUpdate?: (config: ExhibitConfig) => void
): Promise<ExhibitConfig> {
  const schemaVersion = raw && typeof raw === 'object' ? (raw as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (typeof schemaVersion !== 'string' || (!schemaVersion.startsWith('2.') && !schemaVersion.startsWith('3.'))) {
    throw new Error('Unsupported exhibit config schema. Expected schemaVersion 2.x or 3.x.');
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) {
    throw new Error('Invalid exhibit config: a non-empty id is required.');
  }
  if (!record.assets || typeof record.assets !== 'object' || Array.isArray(record.assets)) {
    throw new Error('Invalid exhibit config: assets must be an object.');
  }
  if (schemaVersion.startsWith('3.')) {
    return loadExhibitConfigV3(raw, signal, onOptionalUpdate);
  }
  if (!record.scene || typeof record.scene !== 'object' || Array.isArray(record.scene)) {
    throw new Error('Invalid exhibit config: scene must be an object.');
  }
  return loadExhibitConfigV2(raw, signal, onOptionalUpdate);
}
