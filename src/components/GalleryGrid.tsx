// src/components/GalleryGrid.tsx

import { GALLERIES } from '../data/galleryConfig';
import TestTile from './TestTile';

export default function GalleryGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
      {GALLERIES.map(item => (
        <div
          key={item.url}
          className="cursor-pointer"
          onDoubleClick={() => {
            // pass configUrl as a query param
            const url =
              `/viewer/index.html?configUrl=${encodeURIComponent(item.configUrl!)}`;
            window.location.href = url;
          }}
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
}
