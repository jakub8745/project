import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore
import { buildGallery } from '../modules/AppBuilder.js';

interface ModularGalleryProps {
  configUrl: string;
  onConfigLoaded?: (config: any) => void;
  imagePath: string;
  img?: HTMLImageElement;
}

const ModularGallery: React.FC<ModularGalleryProps> = ({ configUrl, onConfigLoaded }) => {
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = configUrl;
    if (!url) return;

    const container = containerRef.current;
    if (!container) {
      console.error('🎨 ModularGallery: container div not mounted');
      return;
    }

    let disposed = false;
    let galleryInstance: { dispose?: () => void } | undefined;

    (async () => {
      try {
        // 1. Fetch config
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const config = await res.json();
        console.log('🎨 Config fetched');

        // 2. Notify parent
        if (onConfigLoaded) onConfigLoaded(config);
        console.log('🎨 Config loaded');

        // 3. Build gallery with progress callback
        galleryInstance = await buildGallery(config, container, {
          onProgress: (progressText: string) => {
            if (!disposed) setProgress(parseInt(progressText, 10));
          }
        });

        console.log('🎨 Gallery built');
        setProgress(100); // ✅ final state

        // 4. Lazy preload images
        if (config.images) {
          const ipfsGateways = [
            "https://ipfs.io/ipfs/",
            "https://cloudflare-ipfs.com/ipfs/",
            "https://gateway.pinata.cloud/ipfs/",
            "https://dweb.link/ipfs/"
          ];

          function ipfsToHttpMulti(ipfsUrl: string, gatewayIndex = 0) {
            const cid = ipfsUrl.replace("ipfs://", "");
            return ipfsGateways[gatewayIndex] + cid;
          }

          function preloadImage(url: string): Promise<HTMLImageElement> {
            return new Promise((resolve, reject) => {
              let attempts = 0;
              const img = new Image();

              const tryLoad = () => {
                const src = url.startsWith("ipfs://")
                  ? ipfsToHttpMulti(url, attempts)
                  : url;

                img.src = src;

                img.onload = () => resolve(img);

                img.onerror = () => {
                  attempts++;
                  if (url.startsWith("ipfs://") && attempts < ipfsGateways.length) {
                    setTimeout(tryLoad, 100);
                  } else {
                    reject(new Error(`Failed to load image from all gateways: ${url}`));
                  }
                };
              };

              tryLoad();
            });
          }

          Object.entries(config.images as Record<string, { imagePath: string; img?: HTMLImageElement }>)
            .forEach(([key, meta]) => {
              preloadImage(meta.imagePath)
                .then(img => {
                  meta.img = img;
                  console.log(`✅ Preloaded image for ${key}`);
                })
                .catch(err => {
                  console.warn(`⚠️ Could not preload image for ${key}:`, err);
                });
            });

          console.log('🎨 Started lazy image preloading with IPFS fallbacks');
        }
      } catch (err) {
        if (!disposed) {
          console.error('⚠️ Error in ModularGallery:', err);
          setError('Error loading gallery');
        }
      }
    })();

    return () => {
      disposed = true;
      if (galleryInstance && typeof galleryInstance.dispose === 'function') {
        galleryInstance.dispose();
      }
      setProgress(0);
      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, [configUrl, onConfigLoaded]);

  const showOverlay = progress < 100 || error;

return (
  <div className="relative w-full h-full">
    {showOverlay && (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
        {error ? (
          <div className="text-2xl text-red-600">{error}</div>
        ) : (
          <div className="relative flex items-center justify-center">
            <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
              <circle
                className="text-gray-300"
                strokeWidth="8"
                stroke="currentColor"
                fill="transparent"
                r="46"
                cx="50"
                cy="50"
              />
              <circle
                className="text-blue-600 transition-all duration-300 ease-out"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 46}`}
                strokeDashoffset={`${2 * Math.PI * 46 * (1 - progress / 100)}`}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="46"
                cx="50"
                cy="50"
              />
            </svg>
            <div className="absolute text-xl font-bold text-blue-700">
              {progress}%
            </div>
          </div>
        )}
      </div>
    )}
    {/* Three.js canvas mount point */}
    <div ref={containerRef} className="w-full h-full absolute" />
  </div>
);

};

export default ModularGallery;
