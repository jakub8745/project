// App.tsx
import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import GalleryGrid from './components/GalleryGrid';
import ModularGallery from './components/ModularGallery';
import { GALLERIES } from './data/galleryConfig';
import { setupModal } from './modules/setupModal';
import { initAppBuilder } from './modules/AppBuilder';

interface Gallery {
  slug: string;
  configUrl: string;
  title: string;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedConfigUrl, setSelectedConfigUrl] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null); //

  // ✅ memoized toggle
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(o => !o);
  }, []);

  // Helper: find gallery by slug
  const findGalleryBySlug = useCallback((slug: string) => {
    return GALLERIES.find(g => g.slug === slug);
  }, []);

  // Handle config after ModularGallery preloads it
  const handleConfigLoaded = useCallback((config: any) => {
    const imagesMap = config.images || {};
    const showModal = setupModal(imagesMap);
    initAppBuilder({ showModal });
  }, []);

  // Unified hash handling (runs once on mount + on changes)
  useEffect(() => {
    function handleHashChange() {
      const slug = window.location.hash.replace('#', '');
      if (slug) {
        const gallery = findGalleryBySlug(slug);
        if (gallery) {
          setSelectedConfigUrl(gallery.configUrl);
          setSelectedSlug(slug);                // ⭐ NEW
          return;
        }
      }
      // fallback: default
      if (GALLERIES[0]) {
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
    window.location.hash = gallery.slug;
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gallery-dark">
      <Sidebar
        open={sidebarOpen}
        onToggle={toggleSidebar}   // ✅ stable reference
        logoText="Blue Point Art"
      >
        <section className="p-4">
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
          <ModularGallery
            configUrl={selectedConfigUrl || ''}
            onConfigLoaded={handleConfigLoaded}
            imagePath={''}
          />
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
    </div>
  );
}
