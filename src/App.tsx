// App.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import './styles/materialModal.css';
import Sidebar from './components/Sidebar';
import GalleryGrid from './components/GalleryGrid';
import { InfoButtons } from './components/InfoButtons';
import ModularGallery, { NormalizedExhibitConfig } from './components/ModularGallery';
import { GALLERIES } from './data/galleryConfig';
import { setupModal } from './modules/setupModal';
import { initAppBuilder } from './modules/AppBuilder';
import Joystick from './components/Joystick';
import { R3FViewer } from './r3f/R3FViewer';
import type Visitor from './modules/Visitor.js';

interface Gallery {
  slug: string;
  configUrl: string;
  title: string;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedConfigUrl, setSelectedConfigUrl] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [viewerMode, setViewerMode] = useState<'legacy' | 'r3f'>('legacy');
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  });

  // ✅ memoized toggle
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(o => !o);
  }, []);

  // Helper: find gallery by slug
  const findGalleryBySlug = useCallback((slug: string) => {
    return GALLERIES.find(g => g.slug === slug);
  }, []);

  // Handle config after ModularGallery preloads it
  const handleConfigLoaded = useCallback((config: NormalizedExhibitConfig) => {
    const imagesMap = (config.images ?? {}) as Parameters<typeof setupModal>[0];
    const showModal = setupModal(imagesMap);
    initAppBuilder({ showModal });
  }, []);

  const handleVisitorReady = useCallback((instance: Visitor | null) => {
    setVisitor(instance);
  }, []);

  // Unified hash handling (runs once on mount + on changes)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouchDevice(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
    } else {
      mq.addListener(update);
    }
    return () => {
      if (mq.removeEventListener) {
        mq.removeEventListener('change', update);
      } else {
        mq.removeListener(update);
      }
    };
  }, []);

  useEffect(() => {
    function handleHashChange() {
      const raw = window.location.hash.replace('#', '');
      if (raw.startsWith('r3f/')) {
        setViewerMode('r3f');
        const slug = raw.slice(4);
        const gallery = findGalleryBySlug(slug);
        if (gallery) {
          setSelectedConfigUrl(gallery.configUrl);
          setSelectedSlug(slug);
          return;
        }
      } else if (raw) {
        const gallery = findGalleryBySlug(raw);
        if (gallery) {
          setViewerMode('legacy');
          setSelectedConfigUrl(gallery.configUrl);
          setSelectedSlug(raw);
          return;
        }
      }
      // fallback: default
      if (GALLERIES[0]) {
        setViewerMode('legacy');
        setSelectedConfigUrl(GALLERIES[0].configUrl);
        setSelectedSlug(GALLERIES[0].slug);
      }
    }

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [findGalleryBySlug]);

  // On gallery click, update hash and close sidebar
  const handleGallerySelect = useCallback((gallery: Gallery) => {
    window.location.hash = viewerMode === 'r3f' ? `r3f/${gallery.slug}` : gallery.slug;
    setSidebarOpen(false);
  }, [viewerMode]);

  const handleJoystickChange = useCallback((x: number, y: number) => {
    visitor?.setJoystickInput?.(x, y);
  }, [visitor]);

  const canvasContent = useMemo(() => {
    if (!selectedConfigUrl) {
      return null;
    }
    if (viewerMode === 'legacy') {
      return (
        <ModularGallery
          configUrl={selectedConfigUrl}
          onConfigLoaded={handleConfigLoaded}
          onVisitorReady={handleVisitorReady}
        />
      );
    }
    return <R3FViewer configUrl={selectedConfigUrl} />;
  }, [handleConfigLoaded, handleVisitorReady, selectedConfigUrl, viewerMode]);

  return (
    <div className="flex h-screen overflow-hidden bg-gallery-dark">
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

      <main className="flex-1 relative">
        <div className="h-full">
          {canvasContent}
        </div>
      </main>

      {/* ✅ Modal DOM lives in React tree */}
      <div id="modalOverlay" className="modal-overlay hidden">
        <div className="modal">
          <button className="modal-close" id="closeModal">×</button>
          <div className="modal-image-container">
            <img id="modalImage" className="modal-image hidden" src="" alt="modal image" />
          </div>
          <div className="modal-description"></div>
        </div>
      </div>

      {viewerMode === 'legacy' && isTouchDevice && visitor?.setJoystickInput && (
        <Joystick onChange={handleJoystickChange} />
      )}
   </div>
  );
}
