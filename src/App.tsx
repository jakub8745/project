import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import GalleryGrid from './components/GalleryGrid';
import ModularGallery from './components/ModularGallery';
import { GALLERIES } from './data/galleryConfig';

interface Gallery {
  configUrl: string;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedConfigUrl, setSelectedConfigUrl] = useState<string | null>(null);

  // On initial mount, fake‐click GALLERIES[1] if available
  useEffect(() => {
    if (!selectedConfigUrl && GALLERIES[1]?.configUrl) {
      setSelectedConfigUrl(GALLERIES[1].configUrl);
      setSidebarOpen(false);
    }
  }, []); // run once

  // On sidebar click (selection), run main.js
  const handleGallerySelect = (gallery: Gallery) => {
    setSelectedConfigUrl(gallery.configUrl);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gallery-dark">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} logoText="Blue Point Art" configUrl={selectedConfigUrl!}>
        <section className="p-4">
          <h2 className="text-xl font-bold mb-4">Choose an exhibit</h2>

          <GalleryGrid
            onSelect={handleGallerySelect}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(o => !o)}
          />
        </section>
      </Sidebar>

      <main className="flex-1 relative">
        <div className="h-full">
          {selectedConfigUrl ? (
            <ModularGallery configUrl={selectedConfigUrl} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Please select an exhibit from the menu.
            </div>
          )}
        </div>
      </main>

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
