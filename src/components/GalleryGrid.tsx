// src/components/GalleryGrid.tsx
import { FC, useRef, useEffect } from 'react';
import { GALLERIES, GalleryItem } from '../data/galleryConfig';
import Tile from './Tile.js';

export interface GalleryGridProps {
  onSelect: (gallery: GalleryItem) => void;
  selectedSlug?: string;
  // Keep these optional if other parts of the app still pass them
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

const GalleryGrid: FC<GalleryGridProps> = ({
  onSelect,
  selectedSlug,
}) => {
  // Track refs for each tile
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll selected tile into view when it changes
  useEffect(() => {
    const el = selectedSlug ? tileRefs.current[selectedSlug] : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedSlug]);

  const base =
    'relative pointer-events-auto cursor-pointer rounded-xl transition ring-offset-2 focus:outline-none focus:ring-2 focus:ring-cyan-400';
  const selected =
    'ring-2 ring-cyan-400 shadow-lg shadow-cyan-900/30';
  const unselected =
    'hover:ring-2 hover:ring-cyan-300/60 hover:shadow'; // no default ring

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {GALLERIES.map((item) => {
        const isSelected = item.slug === selectedSlug;
        return (
          <div
            key={item.url}
            ref={(el) => (tileRefs.current[item.slug] = el)}
            className={`${base} ${isSelected ? selected : unselected}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(item);
            }}
          >
            <Tile
              modelUrl={item.url}
              title={item.title}
              description={item.description}
              scale={item.scale}
              position={item.position}
            />
          </div>
        );
      })}
    </div>
  );
};

export default GalleryGrid;
