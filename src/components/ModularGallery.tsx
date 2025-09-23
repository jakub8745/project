import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore
import { buildGallery } from '../modules/AppBuilder.js';
import { resolveOracleUrl, isIpfsUri } from '../utils/ipfs';

interface ModularGalleryProps {
  configUrl: string;
  onConfigLoaded?: (config: any) => void;
  onVisitorReady?: (visitor: any | null) => void;
}

/**
 * Extract last segment of ipfs://… (the actual filename).
 */

/**
 * Rewrite all relevant config paths to Oracle URLs.
 */
function normalizeConfig(config: any) {
  const bucket = config.id;

  const images = config.images
    ? Object.fromEntries(
        Object.entries(config.images).map(([key, meta]: [string, any]) => {
          const originalPath = meta?.imagePath;
          const isIpfs = isIpfsUri(originalPath);
          const oracleUrl = isIpfs && bucket ? resolveOracleUrl(originalPath, bucket) : undefined;
          return [
            key,
            {
              ...meta,
              // Keep original IPFS for fallback use
              ipfsImagePath: isIpfs ? originalPath : meta?.ipfsImagePath,
              // Prefer Oracle URL if available; otherwise keep original
              imagePath: oracleUrl || originalPath,
              oracleImagePath: oracleUrl || meta?.oracleImagePath,
            },
          ];
        })
      )
    : config.images;

  const videos = Array.isArray(config.videos)
    ? config.videos.map((vid: any) => ({
        ...vid,
        sources: Array.isArray(vid.sources)
          ? vid.sources.map((srcObj: any) => {
              const originalSrc = srcObj?.src;
              const isIpfs = isIpfsUri(originalSrc);
              const oracleSrc = isIpfs && bucket ? resolveOracleUrl(originalSrc, bucket) : undefined;
              return {
                ...srcObj,
                ipfsSrc: isIpfs ? originalSrc : srcObj?.ipfsSrc,
                oracleSrc: oracleSrc || srcObj?.oracleSrc,
                // Prefer Oracle if available, otherwise keep original
                src: oracleSrc || originalSrc,
              };
            })
          : vid.sources,
      }))
    : config.videos;

  const audio = Array.isArray(config.audio)
    ? config.audio.map((a: any) => {
        const originalUrl = a?.url;
        const isIpfs = isIpfsUri(originalUrl);
        const oracleUrl = isIpfs && bucket ? resolveOracleUrl(originalUrl, bucket) : undefined;
        return {
          ...a,
          ipfsUrl: isIpfs ? originalUrl : a?.ipfsUrl,
          oracleUrl: oracleUrl || a?.oracleUrl,
          url: oracleUrl || originalUrl,
        };
      })
    : config.audio;

  const originalModelPath = config.modelPath;
  const originalInteractivesPath = config.interactivesPath;

  // Sidebar icons normalization (ipfs:// → Oracle URL, with IPFS fallback stored)
  const sidebarItems = Array.isArray(config?.sidebar?.items)
    ? config.sidebar.items.map((item: any) => {
        const originalIcon = item?.icon;
        const iconIsIpfs = isIpfsUri(originalIcon);
        const oracleIcon = iconIsIpfs && bucket ? resolveOracleUrl(originalIcon, bucket) : undefined;
        return {
          ...item,
          ipfsIcon: iconIsIpfs ? originalIcon : item?.ipfsIcon,
          oracleIcon: oracleIcon || item?.oracleIcon,
          icon: oracleIcon || originalIcon,
        };
      })
    : config?.sidebar?.items;

  return {
    ...config,
    images,
    videos,
    audio,
    sidebar: config.sidebar ? { ...config.sidebar, items: sidebarItems } : config.sidebar,
    // preserve original IPFS for fallback
    ipfsModelPath: isIpfsUri(originalModelPath)
      ? originalModelPath
      : config.ipfsModelPath,
    ipfsInteractivesPath: isIpfsUri(originalInteractivesPath)
      ? originalInteractivesPath
      : config.ipfsInteractivesPath,
    modelPath: originalModelPath
      ? resolveOracleUrl(originalModelPath, bucket)
      : originalModelPath,
    interactivesPath: originalInteractivesPath
      ? resolveOracleUrl(originalInteractivesPath, bucket)
      : originalInteractivesPath,
    backgroundTexture: config.backgroundTexture
      ? resolveOracleUrl(config.backgroundTexture, bucket)
      : config.backgroundTexture,
  };
}

/**
 * Lazy preload a single image from an already-normalized Oracle URL.
 */
function preloadImageOracle(url: string, registry?: HTMLImageElement[]): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('Empty image URL'));
    const img = new Image();
    if (registry) registry.push(img);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}

function preloadImageFromIpfs(ipfsUrl: string, registry?: HTMLImageElement[]): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!ipfsUrl || !isIpfsUri(ipfsUrl)) return reject(new Error('Invalid IPFS URL'));
    const gateways = [
      'https://ipfs.io/ipfs/',
      'https://cloudflare-ipfs.com/ipfs/',
      'https://gateway.pinata.cloud/ipfs/',
      'https://dweb.link/ipfs/',
    ];
    const cid = ipfsUrl.replace('ipfs://', '');
    let i = 0;
    const img = new Image();
    if (registry) registry.push(img);
    const tryNext = () => {
      if (i >= gateways.length) {
        reject(new Error(`Failed all IPFS gateways for: ${ipfsUrl}`));
        return;
      }
      img.onload = () => resolve(img);
      img.onerror = () => {
        i += 1;
        setTimeout(tryNext, 100);
      };
      img.src = gateways[i] + cid;
    };
    tryNext();
  });
}

/**
 * Kick off non-blocking preloads for all images in config.images.
 * Stores the loaded HTMLImageElement on each meta as meta.img.
 */
function lazyPreloadImagesFromOracle(config: any) {
  if (!config?.images) return () => {};
  const registry: HTMLImageElement[] = [];
  let alive = true;
  try {
    Object.entries(config.images as Record<string, any>).forEach(([key, meta]) => {
      const primaryUrl = meta?.imagePath;
      const ipfsUrl = meta?.ipfsImagePath;
      if (!primaryUrl && !ipfsUrl) return;

      const onSuccess = (img: HTMLImageElement) => {
        if (!alive) return;
        meta.img = img; // cache for modal usage
      };

      const onOracleFail = (err: any) => {
        if (!alive) return;
        if (ipfsUrl) {
          preloadImageFromIpfs(ipfsUrl, registry)
            .then(onSuccess)
            .catch((err2) => {
              if (!alive) return;
              console.warn(`⚠️ Could not preload image for ${key} (Oracle+IPFS failed):`, err2);
            });
        } else {
          console.warn(`⚠️ Could not preload image for ${key} (Oracle failed, no IPFS fallback):`, err);
        }
      };

      if (primaryUrl && typeof primaryUrl === 'string' && primaryUrl.startsWith('http')) {
        preloadImageOracle(primaryUrl, registry).then(onSuccess).catch(onOracleFail);
      } else if (ipfsUrl && typeof ipfsUrl === 'string') {
        preloadImageFromIpfs(ipfsUrl, registry).then(onSuccess).catch((err3) => {
          if (!alive) return;
          console.warn(`⚠️ Could not preload image for ${key} (IPFS failed):`, err3);
        });
      }
    });
  } catch (err) {
    console.warn('⚠️ Error during lazy image preloading:', err);
  }
  // Return a cancel function to abort in-flight image requests
  return () => {
    alive = false;
    for (const img of registry) {
      try {
        img.onload = null as any;
        img.onerror = null as any;
        // Setting src to '' hints the browser to cancel the request
        img.src = '';
      } catch {}
    }
    registry.length = 0;
  };
}

const ModularGallery: React.FC<ModularGalleryProps> = ({ configUrl, onConfigLoaded, onVisitorReady }) => {
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!configUrl) return;

    const container = containerRef.current;
    if (!container) {
      console.error("🎨 ModularGallery: container div not mounted");
      return;
    }

    let disposed = false;
    let galleryInstance: { dispose?: () => void } | undefined;

    (async () => {
      try {
        // 1. Fetch config
        const res = await fetch(configUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let config = await res.json();
        console.log("🎨 Config fetched");

        // 2. Normalize asset URLs
        config = normalizeConfig(config);
        console.log("🎨 Config normalized to Oracle URLs");

        // 3. Notify parent
        onConfigLoaded?.(config);

        console.log("🎨 Config loaded", config);

        // 4. Build gallery with progress callback
        galleryInstance = await buildGallery(config, container, {
          onProgress: (progressValue: string | number) => {
            if (disposed) return;
            const n =
              typeof progressValue === "number"
                ? progressValue
                : parseInt(progressValue, 10);
            if (!Number.isFinite(n) || Number.isNaN(n)) return;
            const clamped = Math.max(0, Math.min(100, Math.round(n)));
            setProgress(clamped);
          },
        });

        console.log("🎨 Gallery built");
        setProgress(100);
        onVisitorReady?.((galleryInstance as any)?.visitor || null);

        // 5. Lazy preload images from Oracle URLs (non-blocking)
        //    Uses normalized config.images[*].imagePath
        const cancelImagePreloads = lazyPreloadImagesFromOracle(config);
        // Attach cancel to cleanup scope
        (galleryInstance as any)._cancelImagePreloads = cancelImagePreloads;
      } catch (err) {
        if (!disposed) {
          console.error("⚠️ Error in ModularGallery:", err);
          setError("Error loading gallery");
        }
      }
    })();

    return () => {
      disposed = true;
      onVisitorReady?.(null);
      // Abort any in-flight image preloads for the previous exhibit
      (galleryInstance as any)?._cancelImagePreloads?.();
      galleryInstance?.dispose?.();
      setProgress(0);
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
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
              <svg className="w-24 h-24" viewBox="0 0 120 120">
                <circle
                  className="text-blue-600 transition-all duration-300 ease-out"
                  fill="currentColor"
                  r="8"
                  cx={60 + 50 * Math.cos((2 * Math.PI * progress) / 100 - Math.PI / 2)}
                  cy={60 + 50 * Math.sin((2 * Math.PI * progress) / 100 - Math.PI / 2)}
                />
              </svg>
              <div className="absolute text-xl font-bold text-blue-700">
                {progress}%
              </div>
            </div>
          )}
        </div>
      )}
      <div ref={containerRef} className="w-full h-full absolute" />
    </div>
  );
};

export default ModularGallery;
