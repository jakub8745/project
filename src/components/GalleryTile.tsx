// src/components/GalleryTile.tsx

import React from 'react';
import { GalleryConfig, useGalleryStore } from '../store/galleryStore';
import ThreeThumbnail from './three/ThreeThumbnail';

interface GalleryTileProps {
  gallery: GalleryConfig;
}

const GalleryTile: React.FC<GalleryTileProps> = ({ gallery }) => {
  const { selectGallery } = useGalleryStore();

  const handleTileClick = () => {
    selectGallery(gallery.id);
  };

  return (
    <div 
      className="bg-gallery-card rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 animate-fade-in"
      onClick={handleTileClick}
    >
      <div className="relative aspect-square">
        <ThreeThumbnail gallery={gallery} />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-medium text-white">{gallery.name}</h3>
        <p className="text-sm text-gallery-muted mt-1 line-clamp-2">{gallery.description}</p>
      </div>
    </div>
  );
};

export default GalleryTile;