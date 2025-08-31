// src/modules/AppBuilder.d.ts

export declare function initAppBuilder(deps: {
  showModal: (userData: any) => void;
}): void;

export declare function buildGallery(
  config: any,
  container?: HTMLElement,
  options?: { onProgress?: (progressText: string) => void }
): Promise<{ dispose?: () => void }>;