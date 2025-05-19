// src/components/GalleryGrid.tsx
import { FC } from 'react';
import { GALLERIES, GalleryItem } from '../data/galleryConfig';
import TestTile from './TestTile';

export interface GalleryGridProps {
  onSelect: (gallery: GalleryItem) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const GalleryGrid: FC<GalleryGridProps> = ({
  onSelect: _onSelect,
  sidebarOpen: _sidebarOpen,
  onToggleSidebar: _onToggleSidebar,
}) => {
  const handleDoubleClick = async (item: GalleryItem) => {
    // dynamically import your main.js module
    try {
      const module = await import('../modules/main.js');
      // call its exported init (or whatever you named it)
      module.init(item.configUrl!);
    } catch (err) {
      console.error('Failed to load main.js:', err);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {GALLERIES.map(item => (
        <div
          key={item.url}
          className="cursor-pointer"
          onDoubleClick={() => handleDoubleClick(item)}
        >
          <TestTile
            modelUrl={item.url}
            title={item.title}
            description={item.description}
            scale={item.scale}
            position={item.position}
          />
        </div>
      ))}
    </div>
  );
};

export default GalleryGrid;
