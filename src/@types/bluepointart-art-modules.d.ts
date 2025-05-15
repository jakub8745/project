// src/@types/bluepointart-art-modules.d.ts
declare module '@bluepointart/art-modules' {
  export function preloadConfigAssets(
    config: any,
    onProgress: (p: number) => void
  ): Promise<void>;

  export function buildGallery(config: any): Promise<void>;
}
