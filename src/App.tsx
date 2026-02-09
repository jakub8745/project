// App.tsx
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import './styles/materialModal.css';
import Sidebar from './components/Sidebar';
import GalleryGrid from './components/GalleryGrid';
import { InfoButtons } from './components/InfoButtons';
import { GALLERIES } from './data/galleryConfig';

const R3FViewer = lazy(async () => {
  const module = await import('./r3f/R3FViewer');
  return { default: module.R3FViewer ?? module.default }; // retain support for both exports
});

interface Gallery {
  slug: string;
  configUrl: string;
  title: string;
}

function getBooleanFromQuery(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export default function App() {
  const isThumbnailMode = getBooleanFromQuery('thumbnailMode') || getBooleanFromQuery('recordThumb');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);
  const [selectedConfigUrl, setSelectedConfigUrl] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const autoHideTimerRef = useRef<number | null>(null);
  const AUTO_HIDE_DELAY_MS = 5000;
  // ✅ memoized toggle
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(o => !o);
  }, []);

  // Helper: find gallery by slug
  const findGalleryBySlug = useCallback((slug: string) => {
    return GALLERIES.find(g => g.slug === slug);
  }, []);

  // Handle hash-based gallery selection
  useEffect(() => {
    function handleHashChange() {
      const rawHash = window.location.hash.replace('#', '').trim();
      const fallbackGallery = GALLERIES[0];

      const normalizedSlug = rawHash
        .replace(/^legacy\/?/i, '')
        .replace(/^r3f\/?/i, '')
        .replace(/^\/+|\/+$/g, '');

      const requestedGallery = normalizedSlug ? findGalleryBySlug(normalizedSlug) : undefined;
      const gallery = requestedGallery ?? fallbackGallery;

      if (!gallery) {
        setSelectedConfigUrl(null);
        setSelectedSlug(null);
        return;
      }

      setSelectedConfigUrl(gallery.configUrl);
      setSelectedSlug(gallery.slug);
    }

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [findGalleryBySlug]);

  // On gallery click, update hash and close sidebar
  const handleGallerySelect = useCallback((gallery: Gallery) => {
    window.location.hash = gallery.slug;
  }, []);

  const scheduleSidebarAutoHide = useCallback(() => {
    if (!sidebarOpen) {
      return;
    }
    if (autoHideTimerRef.current !== null) {
      window.clearTimeout(autoHideTimerRef.current);
    }
    autoHideTimerRef.current = window.setTimeout(() => {
      setSidebarOpen(false);
    }, AUTO_HIDE_DELAY_MS);
  }, [sidebarOpen]);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) {
      return undefined;
    }

    const handleActivity = () => {
      scheduleSidebarAutoHide();
    };

    const events: Array<keyof HTMLElementEventMap> = [
      'pointerdown',
      'pointermove',
      'wheel',
      'touchstart',
      'touchmove',
      'keydown',
    ];

    events.forEach(eventName => {
      mainEl.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(eventName => {
        mainEl.removeEventListener(eventName, handleActivity);
      });
    };
  }, [scheduleSidebarAutoHide]);

  useEffect(() => {
    return () => {
      if (autoHideTimerRef.current !== null) {
        window.clearTimeout(autoHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateViewportFlags = () => {
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const narrowViewport = window.matchMedia('(max-width: 1024px)').matches;
      const portraitNow = window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
      setIsMobileViewport(coarsePointer && narrowViewport);
      setIsPortrait(portraitNow);
      setIsFullscreen(Boolean(document.fullscreenElement));
      if (!portraitNow) {
        setShowRotateHint(false);
      }
    };

    updateViewportFlags();
    window.addEventListener('resize', updateViewportFlags);
    window.addEventListener('orientationchange', updateViewportFlags);
    document.addEventListener('fullscreenchange', updateViewportFlags);
    return () => {
      window.removeEventListener('resize', updateViewportFlags);
      window.removeEventListener('orientationchange', updateViewportFlags);
      document.removeEventListener('fullscreenchange', updateViewportFlags);
    };
  }, []);

  const requestLandscapeFullscreen = useCallback(async () => {
    const root = document.documentElement;

    try {
      if (!document.fullscreenElement && root.requestFullscreen) {
        await root.requestFullscreen();
      }
    } catch {
      // ignore, fallback message is shown below
    }

    let orientationLocked = false;
    const orientationApi = (screen as Screen & { orientation?: { lock?: (mode: string) => Promise<void> } }).orientation;
    if (orientationApi?.lock) {
      try {
        await orientationApi.lock('landscape');
        orientationLocked = true;
      } catch {
        orientationLocked = false;
      }
    }

    const portraitNow = window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
    setShowRotateHint(!orientationLocked && portraitNow);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gallery-dark">
      {!isThumbnailMode ? (
        <Sidebar
          open={sidebarOpen}
          onToggle={toggleSidebar}   // ✅ stable reference
          logoText="Blue Point Art Gallery [Archive]"
        >
          <section className="p-4 bg-slate-500/35 border-b border-slate-400/40 text-white">
            {/* Exhibit info section (expandable items) */}
            {selectedConfigUrl && (
              <InfoButtons configUrl={selectedConfigUrl} />
            )}
          </section>

          <section className="p-4 bg-slate-500/35 text-white">
            <h2 className="text-xl font-bold mb-4">Choose an exhibit</h2>
            <GalleryGrid
              onSelect={handleGallerySelect} // ✅ memoized
              sidebarOpen={sidebarOpen}
              onToggleSidebar={toggleSidebar} // ✅ stable reference
              selectedSlug={selectedSlug ?? undefined}
            />
          </section>
        </Sidebar>
      ) : null}

      <main ref={mainRef} className="flex-1 relative">
        <div className="h-full">
          {selectedConfigUrl ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-white/70">
                  Loading viewer…
                </div>
              }
            >
              <R3FViewer
                configUrl={selectedConfigUrl}
              />
            </Suspense>
          ) : null}
        </div>
      </main>

      {!isThumbnailMode && showHowToModal && (
        <div className="fixed inset-0 z-[1200] bg-black/70 flex items-end md:items-center justify-center p-2 sm:p-3 md:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="How to move instructions"
            className="relative w-full max-w-4xl h-auto max-h-[95dvh] overflow-hidden rounded-xl border border-slate-300 bg-slate-100 text-slate-900 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setShowHowToModal(false)}
              className="absolute top-2 right-2 z-10 rounded-full border border-slate-400 bg-white px-3 py-1 text-lg font-bold leading-none text-slate-800"
              aria-label="Close help modal"
            >
              X
            </button>
            <div className="p-3 pt-12 sm:p-4 sm:pt-14">
              <img
                src="/icons/archive_how_to_move_icons.jpg"
                alt="How to move in the gallery instructions"
                className="w-full h-auto max-h-[calc(95dvh-4rem)] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {!isThumbnailMode && isMobileViewport && !isFullscreen && (
        <button
          type="button"
          onClick={requestLandscapeFullscreen}
          className="fixed bottom-3 right-3 z-[1300] rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900 shadow-lg"
          aria-label="Enter fullscreen landscape mode"
        >
          Fullscreen landscape
        </button>
      )}

      {!isThumbnailMode && isMobileViewport && isPortrait && showRotateHint && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[1400] rounded-lg border border-slate-400 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg">
          Rotate device to landscape.
        </div>
      )}
    </div>
  );
}
