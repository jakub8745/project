// App.tsx
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
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

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedConfigUrl, setSelectedConfigUrl] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

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
    setSidebarOpen(false);
  }, []);

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
                onRequestSidebarClose={() => setSidebarOpen(false)}
              />
            </Suspense>
          ) : null}
        </div>
      </main>

   </div>
  );
}
