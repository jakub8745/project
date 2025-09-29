export interface TooltipOptions {
  className?: string;
}

export interface TooltipHandle {
  show(args: { x: number; y: number; text: string; key?: string }): void;
  hide(): void;
  destroy(): void;
  readonly currentKey: string | null;
}

export function createTooltip(options?: TooltipOptions): TooltipHandle;
