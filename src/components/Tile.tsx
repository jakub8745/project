// src/components/Tile.tsx
import React from 'react';
import { useInViewport } from '../hooks/useInViewport';

export interface TileProps {
  thumbnailVideo?: string;
  thumbnailPoster?: string;
  title?: string;
  description?: string;
  activePreview?: boolean;
}

const Tile: React.FC<TileProps> = ({
  thumbnailVideo,
  thumbnailPoster,
  title = '3D Model',
  description = 'Loading preview…',
  activePreview = false,
}) => {
  const [tileRef, inViewport] = useInViewport<HTMLDivElement>(0.35);
  const shouldRenderVideo = Boolean(thumbnailVideo) && inViewport && activePreview;

  return (
    <div
      ref={tileRef}
      className="bg-transparent border border-white/20 rounded-lg overflow-hidden hover:bg-white/5 transition-all duration-300 animate-fade-in"
    >
      <div className="relative aspect-square tile-canvas">
        {shouldRenderVideo ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={thumbnailVideo}
            poster={thumbnailPoster}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            aria-label={`${title} thumbnail`}
          />
        ) : (
          thumbnailPoster ? (
            <img
              className="absolute inset-0 h-full w-full object-cover"
              src={thumbnailPoster}
              alt={`${title} thumbnail`}
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" aria-hidden="true">
            </div>
          )
        )}
      </div>
      <div className="p-4 bg-transparent">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-200 mt-1">{description}</p>
      </div>
    </div>
  );
};

export default Tile;
