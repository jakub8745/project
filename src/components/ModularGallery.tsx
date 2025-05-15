// src/components/ModularGallery.tsx
import React, { useEffect, useRef } from 'react';
import { preloadConfigAssets, buildGallery } from '@bluepointart/art-modules';
import '/viewer/main.css?url'; // import the viewer's CSS into your React app

interface ModularGalleryProps {
  /** URL to the JSON config (e.g. from IPFS/NFT metadata) */
  configUrl: string;
}

const ModularGallery: React.FC<ModularGalleryProps> = ({ configUrl }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const loaderRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!configUrl) return;

    (async () => {
      try {
        const res = await fetch(configUrl);
        if (!res.ok) throw new Error(res.statusText);
        const config = await res.json();

        // update loader
        await preloadConfigAssets(config, (p: number) => {
          if (loaderRef.current) loaderRef.current.textContent = `${Math.floor(p * 100)}%`;
        });

        // hide overlay when ready
        if (overlayRef.current) overlayRef.current.style.display = 'none';

        // build gallery into default container
        await buildGallery(config);
      } catch (err) {
        console.error('Error mounting modular gallery:', err);
        if (loaderRef.current) loaderRef.current.textContent = 'Error';
      }
    })();
  }, [configUrl]);

  return (
    <div className="relative w-full h-full">
      <div 
        ref={overlayRef}
        className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10"
      >
        <div ref={loaderRef} className="text-2xl text-blue-700">0%</div>
      </div>
      {/* Default gallery container; buildGallery will mount here */}
      <div id="gallery-container" className="w-full h-full" />
    </div>
  );
};

export default ModularGallery;
