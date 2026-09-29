// src/components/GalleryGrid.tsx
import { FC, useEffect, useRef, useState } from 'react';
import { GALLERIES, GalleryItem, resolveGalleryConfigUrl } from '../data/galleryConfig';
import { fetchManifest } from '../config/manifestRepository';
import { useInViewport } from '../hooks/useInViewport';
import Tile from './Tile.tsx';

export interface GalleryGridProps {
  onSelect: (gallery: GalleryItem) => void;
  selectedSlug?: string;
  // Keep these optional if other parts of the app still pass them
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

function GalleryTileContent({ item, activePreview }: { item: GalleryItem; activePreview: boolean }) {
  const [metadataRef, inViewport] = useInViewport<HTMLDivElement>(0.1);
  const [metadata, setMetadata] = useState<{ title: string; tileDescription: string }>({
    title: item.slug,
    tileDescription: ''
  });
  const configUrl = typeof window !== 'undefined'
    ? resolveGalleryConfigUrl(item, window.location.search)
    : item.configUrl;

  useEffect(() => {
    if (!inViewport) return undefined;
    const controller = new AbortController();
    fetchManifest(configUrl, controller.signal)
      .then((raw) => {
        if (!raw || typeof raw !== 'object' || !('metadata' in raw)) return;
        const info = (raw as { metadata?: unknown }).metadata;
        if (!info || typeof info !== 'object') return;
        const record = info as Record<string, unknown>;
        setMetadata({
          title: typeof record.title === 'string' && record.title.trim() ? record.title : item.slug,
          tileDescription: typeof record.tileDescription === 'string' ? record.tileDescription : ''
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [configUrl, inViewport, item.slug]);

  return (
    <div ref={metadataRef}>
      <Tile
        thumbnailVideo={item.thumbnailVideo}
        thumbnailPoster={item.thumbnailPoster}
        title={metadata.title}
        description={metadata.tileDescription}
        activePreview={activePreview}
      />
    </div>
  );
}

const GalleryGrid: FC<GalleryGridProps> = ({
  onSelect,
  selectedSlug,
}) => {
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const el = selectedSlug ? tileRefs.current[selectedSlug] : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedSlug]);

  const base =
    'relative pointer-events-auto cursor-pointer rounded-xl transition ring-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white/30 border border-white/35 backdrop-blur-sm';
  const selected =
    'ring-4 ring-cyan-100 border-cyan-100 bg-white/60 shadow-2xl shadow-cyan-200/55';
  const unselected =
    'hover:ring-2 hover:ring-sky-200 hover:bg-white/35';

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
            <GalleryTileContent item={item} activePreview={isSelected} />
          </div>
        );
      })}
    </div>
  );
};

export default GalleryGrid;
