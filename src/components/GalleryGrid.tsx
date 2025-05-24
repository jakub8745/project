// src/components/GalleryGrid.tsx
import { FC } from 'react';
import { GALLERIES, GalleryItem } from '../data/galleryConfig';
import Tile from './Tile.js';

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
  

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {GALLERIES.map(item => (
        <div
          key={item.url}
          className="cursor-pointer"
          onDoubleClick={() => _onSelect(item)}
        >
          <Tile
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
