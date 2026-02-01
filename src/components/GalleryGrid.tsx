// src/components/GalleryGrid.tsx
import { FC, useRef, useEffect } from 'react';
import { GALLERIES, GalleryItem } from '../data/galleryConfig';
import Tile from './Tile.tsx';

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
    'relative pointer-events-auto cursor-pointer rounded-xl transition ring-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white/30 border border-white/35 backdrop-blur-sm';
  const selected =
    'ring-2 ring-sky-300 shadow-lg shadow-sky-400/30 bg-white/40';
  const unselected =
    'hover:ring-2 hover:ring-sky-200 hover:bg-white/35'; // no default ring

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {GALLERIES.map((item) => {
        const isSelected = item.slug === selectedSlug;
        return (
          <div
            key={item.slug}
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
              thumbnailVideo={item.thumbnailVideo}
              thumbnailPoster={item.thumbnailPoster}
              title={item.title}
              description={item.description}
            />
          </div>
        );
      })}
    </div>
  );
};

export default GalleryGrid;
