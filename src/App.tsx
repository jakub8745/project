// src/App.tsx
import { useState } from 'react';
import Sidebar from './components/Sidebar';
import GalleryGrid from './components/GalleryGrid';
import ModularGallery from './components/ModularGallery';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedConfigUrl, setSelectedConfigUrl] = useState<string | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-gallery-dark">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        logoText="Blue Point Art"
      >
        <section className="p-4">
          <h2 className="text-xl font-bold mb-4">Choose an exhibit</h2>
          <GalleryGrid
            onSelect={(gallery) => {
              setSelectedConfigUrl(gallery.configUrl);
              setSidebarOpen(false);
            }}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(o => !o)}
          />
        </section>
      </Sidebar>

      <main className="flex-1 relative">
        <div className="pt-16 h-full">
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
        <img id="modalLoader" className="modal-loader"
          src="https://bafybeihdetw233mokonbvepkkwha6ht4q645gwlxtheege5tbvyqzwkiiq.ipfs.w3s.link/logo_BPA_256px.gif"
          alt="Loading…" />
        <img id="modalImage" className="modal-image hidden" src="" alt="modal image" />
      </div>
      <div className="modal-description"></div>
    </div>
  </div>

    </div>
  );
}
