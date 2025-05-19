// src/components/ModularGallery.tsx
import React, { useEffect, useRef } from 'react';
import { preloadConfigAssets, buildGallery } from '@bluepointart/art-modules';
import '/viewer/main.css?url';

interface ModularGalleryProps {
  /** The URL of the gallery JSON to load and render */
  configUrl: string;
}

const DEFAULT_CONFIG_URL =
  'https://bafybeiacxiiqnajlgll6naaulp6ervnfte6kbp75hkhsj4gzpzz7wxze7m.ipfs.w3s.link/exhibit_puno85_config.json';

const ModularGallery: React.FC<ModularGalleryProps> = ({ configUrl }) => {
  const overlayRef   = useRef<HTMLDivElement>(null);
  const loaderRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // decide which URL to use: prop → default
    const url = configUrl || DEFAULT_CONFIG_URL;

    // grab the container synchronously
    const container = containerRef.current;
    if (!container) {
      console.error('🎨 ModularGallery: container div not mounted');
      return;
    }
    console.log('🎨 ModularGallery: rendering into', container);

    let cancelled = false;

    (async () => {
      try {
        // fetch gallery config JSON
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const config = await res.json();

        // preload assets, update loader
        await preloadConfigAssets(config, (p: number) => {
          if (loaderRef.current) {
            loaderRef.current.textContent = `${Math.floor(p * 100)}%`;
          }
        });
        if (cancelled) return;

        // hide the loading overlay
        if (overlayRef.current) {
          overlayRef.current.style.display = 'none';
        }

        console.log('🎨 ModularGallery: loaded container', container);
        // actually build the Three.js gallery into our container div
        await buildGallery(config);
      } catch (err) {
        console.error('⚠️ Error in ModularGallery:', err);
        if (loaderRef.current) {
          loaderRef.current.textContent = 'Error loading gallery';
        }
      }
    })();

    return () => {
      cancelled = true;
      // optionally dispose of Three.js renderer/scene here if buildGallery returns them
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
      {/* The div where Three.js canvas will be appended */}
      <div ref={containerRef} className="w-full h-full absolute" />
    </div>
  );
};

export default ModularGallery;
