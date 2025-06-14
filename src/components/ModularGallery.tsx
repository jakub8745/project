import React, { useEffect, useRef } from 'react';
// @ts-ignore
import { buildGallery } from '../modules/AppBuilder.js';
// @ts-ignore
import { preloadConfigAssets } from '../modules/preloadConfigAssets.js';

interface ModularGalleryProps {
  configUrl: string;
}

const DEFAULT_CONFIG_URL = "/configs/puno85_config.json";


const ModularGallery: React.FC<ModularGalleryProps> = ({ configUrl }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  console.log("DEFAULT_CONFIG_URL", DEFAULT_CONFIG_URL, configUrl);

  useEffect(() => {
    const url = configUrl || DEFAULT_CONFIG_URL;
    const container = containerRef.current;
    if (!container) {
      console.error('🎨 ModularGallery: container div not mounted');
      return;
    }

    let disposed = false;
    // galleryInstance is shared between effect and cleanup
    let galleryInstance: { dispose?: () => void } | undefined;

    (async () => {
      try {
        // 1. Fetch config
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const config = await res.json();

        // 2. Preload assets, update loader text
        await preloadConfigAssets(config, (p: number) => {
          if (loaderRef.current) {
            loaderRef.current.textContent = `${Math.floor(p * 100)}%`;
          }
        });
        if (disposed) return;

        // 3. Build the gallery, keep disposer reference
        galleryInstance = await buildGallery(config, container);

        // 4. Hide loading overlay
        if (overlayRef.current) {
          overlayRef.current.style.display = 'none';
        }
      } catch (err) {
        if (disposed) return;
        console.error('⚠️ Error in ModularGallery:', err);
        if (loaderRef.current) {
          loaderRef.current.textContent = 'Error loading gallery';
        }
      }
    })();

    return () => {
      disposed = true;
      // Dispose the gallery
      if (galleryInstance && typeof galleryInstance.dispose === 'function') {
        galleryInstance.dispose();
      }
      // Reset the overlay/loader for next mount
      if (overlayRef.current) overlayRef.current.style.display = '';
      if (loaderRef.current) loaderRef.current.textContent = '0%';

      // Extra safety: Remove leftover canvas in container
      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, [configUrl]);

  return (
    <div className="relative w-full h-full">
      {/* Loading overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20"
      >
        <div ref={loaderRef} className="text-2xl text-blue-700">0%</div>
      </div>
      {/* Where Three.js canvas is attached */}
      <div ref={containerRef} className="w-full h-full absolute" />
    </div>
  );
};

export default ModularGallery;
