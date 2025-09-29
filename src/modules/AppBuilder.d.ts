// src/modules/AppBuilder.d.ts

export interface GalleryBuildOptions {
  onProgress?: (progressText: string | number) => void;
}

export interface GalleryBuildResult {
  dispose?: () => void;
  visitor?: import('./Visitor').default | null;
  _cancelImagePreloads?: () => void;
}

export declare function initAppBuilder(deps: {
  showModal: (userData: Record<string, unknown>) => void;
}): void;

export declare function buildGallery(
  config: Record<string, unknown>,
  container?: HTMLElement,
  options?: GalleryBuildOptions
): Promise<GalleryBuildResult>;
