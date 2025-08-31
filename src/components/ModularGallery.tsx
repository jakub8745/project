import React, { useEffect, useRef } from 'react';
// @ts-ignore
import { buildGallery } from '../modules/AppBuilder.js';

interface ModularGalleryProps {
  configUrl: string;
  onConfigLoaded?: (config: any) => void;
  imagePath: string;
  img?: HTMLImageElement;
}



//const DEFAULT_CONFIG_URL = "/configs/puno85_config.json";

const ModularGallery: React.FC<ModularGalleryProps> = ({ configUrl, onConfigLoaded }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = configUrl// || DEFAULT_CONFIG_URL;
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

        // 2. Build the gallery immediately (AppBuilder/ModelLoader use raw paths)
        if (onConfigLoaded) onConfigLoaded(config);
        console.log('🎨 Config loaded:');
        //galleryInstance = await buildGallery(config, container);
        galleryInstance = await buildGallery(
          config,
          container,
          {
            onProgress: (progressText: string) => {
              if (loaderRef.current) {
                loaderRef.current.textContent = progressText;
              }
            }
          }
        );

        console.log('🎨 Gallery built');

        // 3. Hide loading overlay
        if (overlayRef.current) {
          overlayRef.current.style.display = 'none';
        }

        // 4. Lazy preload images in background
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
                    // retry with a short delay to avoid hammering CPU/GPU
                    setTimeout(tryLoad, 100);
                  } else {
                    reject(new Error(`Failed to load image from all gateways: ${url}`));
                  }
                };
              };

              tryLoad();
            });
          }


          // 👇 add type assertion here
          Object.entries(config.images as Record<string, { imagePath: string; img?: HTMLImageElement }>)
            .forEach(([key, meta]) => {
              preloadImage(meta.imagePath)
                .then(img => {
                  meta.img = img; // safe now
                  console.log(`✅ Preloaded image for ${key}`);
                })
                .catch(err => {
                  console.warn(`⚠️ Could not preload image for ${key}:`, err);
                });
            });

          console.log('🎨 Started lazy image preloading with IPFS fallbacks');
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
      if (galleryInstance && typeof galleryInstance.dispose === 'function') {
        galleryInstance.dispose();
      }
      //if (overlayRef.current) overlayRef.current.style.display = '';
      if (loaderRef.current) loaderRef.current.textContent = '0%';

      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, [configUrl, onConfigLoaded]);

  return (
    <div className="relative w-full h-full">
      {/* Loading overlay (now only until config is fetched + gallery built) */}
      <div
        ref={overlayRef}
        className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20"
      >
        <div ref={loaderRef} className="text-2xl text-blue-700">0%</div>
      </div>
      {/* Three.js canvas mount point */}
      <div ref={containerRef} className="w-full h-full absolute" />
    </div>
  );
};

export default ModularGallery;
