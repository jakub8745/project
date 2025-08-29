import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import GalleryGrid from './components/GalleryGrid';
import ModularGallery from './components/ModularGallery';
import { GALLERIES } from './data/galleryConfig';

// src/App.tsx
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

  // Helper: find gallery by slug
  const findGalleryBySlug = (slug: string) => {
    return GALLERIES.find(g => g.slug === slug);
  };

  // Handle config after ModularGallery preloads it
  const handleConfigLoaded = useCallback((config: any) => {
    const imagesMap = config.images || {};
    const showModal = setupModal(imagesMap);
    initAppBuilder({ showModal });
  }, []);

  // On initial mount, only resolve default gallery *after* sidebar has rendered once
  useEffect(() => {
    // run in a microtask after first paint
    requestAnimationFrame(() => {
      const slug = window.location.hash.replace('#', '');
      if (slug) {
        const gallery = findGalleryBySlug(slug);
        if (gallery) {
          setSelectedConfigUrl(gallery.configUrl);
          setSidebarOpen(false);
          return;
        }
      }
      // fallback: default gallery
      if (GALLERIES[0]) {
        setSelectedConfigUrl(GALLERIES[0].configUrl);
        setSidebarOpen(false);
      }
    });
  }, []);

  // On hash changes, update selected gallery
  useEffect(() => {
    function handleHashChange() {
      const slug = window.location.hash.replace('#', '');
      if (slug) {
        const gallery = findGalleryBySlug(slug);
        if (gallery) {
          setSelectedConfigUrl(gallery.configUrl);
          return;
        }
      }
      // fallback: default
      if (GALLERIES[0]) {
        setSelectedConfigUrl(GALLERIES[0].configUrl);
      }
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleGallerySelect = (gallery: Gallery) => {
    window.location.hash = gallery.slug;
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gallery-dark">
      {/* Sidebar ALWAYS visible first */}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        logoText="Blue Point Art"
        configUrl={selectedConfigUrl || ""}
      >
        <section className="p-4">
          <h2 className="text-xl font-bold mb-4">Choose an exhibit</h2>
          <GalleryGrid
            onSelect={handleGallerySelect}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(o => !o)}
          />
        </section>
      </Sidebar>

      {/* Main content */}
      <main className="flex-1 relative">
        <div className="h-full">
          {selectedConfigUrl ? (
            <ModularGallery
              key={selectedConfigUrl}
              configUrl={selectedConfigUrl}
              onConfigLoaded={handleConfigLoaded}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading default gallery…
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
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
