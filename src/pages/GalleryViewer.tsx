// src/pages/GalleryViewer.tsx
import React from 'react';
import { useSearchParams } from 'react-router-dom';

const GalleryViewer: React.FC = () => {
  const [searchParams] = useSearchParams();
  const configUrl = searchParams.get('configUrl');

  if (!configUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white">
        <p>No <code>configUrl</code> provided.</p>
      </div>
    );
  }

  const src = `/viewer/index.html?configUrl=${encodeURIComponent(configUrl)}`;

  return (
    <iframe
      src={src}
      className="w-full h-full flex-1"
      style={{ border: 'none' }}
      title="Gallery Viewer"
    />
  );
};

export default GalleryViewer;



