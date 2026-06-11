import type { VisitorParams } from '../modules/Visitor.js';

export type ControllerParams = Partial<VisitorParams> & Record<string, unknown>;
type VisitorDirectionInput = NonNullable<VisitorParams['spawnDirection']>;

export function isVisitorDirectionInput(source: unknown): source is VisitorDirectionInput {
  if (typeof source === 'string') return true;
  if (Array.isArray(source) && source.length === 3) return true;
  return Boolean(
    source &&
    typeof source === 'object' &&
    typeof (source as Record<string, unknown>).x === 'number' &&
    typeof (source as Record<string, unknown>).y === 'number' &&
    typeof (source as Record<string, unknown>).z === 'number'
  );
}
