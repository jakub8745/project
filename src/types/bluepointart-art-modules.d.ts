// src/@types/bluepointart-art-modules.d.ts
declare module '@bluepointart/art-modules' {
  export function preloadConfigAssets(
    config: Record<string, unknown>,
    onProgress: (p: number) => void
  ): Promise<void>;

  export function buildGallery(config: Record<string, unknown>): Promise<void>;
}
