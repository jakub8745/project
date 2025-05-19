


// src/App.tsx
import Header from './components/Header';
import GalleryGrid from './components/GalleryGrid';
import ModularGallery from './components/ModularGallery';


import { useGalleryStore } from './store/galleryStore';

function App() {
  const { selectedGallery } = useGalleryStore();

  return (
    <div className="min-h-screen bg-gallery-dark flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        {selectedGallery ? (
          <ModularGallery configUrl={selectedGallery.modelPath!} />) : (
          <GalleryGrid />
        )}
      </main>
    </div>
  );
}

export default App;
