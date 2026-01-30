// src/components/Tile.tsx
import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Loader2 } from 'lucide-react';
import Model from './Model';
import { getKtx2Loader } from '../loaders/ktx2Loader';
import { useInViewport } from '../hooks/useInViewport';

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
}

export interface TileProps {
  modelUrl: string;
  title?: string;
  description?: string;
  scale?: number;
  position?: [number, number, number];
}

const Tile: React.FC<TileProps> = ({
  modelUrl,
  title = '3D Model',
  description = 'Loading preview…',
  scale,
  position,
}) => {
  const [tileRef, inViewport] = useInViewport<HTMLDivElement>(0.35);
  const isMobile = useIsMobile();
  const shouldRenderCanvas = inViewport;

  return (
    <div
      ref={tileRef}
      className="bg-transparent border border-white/20 rounded-lg overflow-hidden hover:bg-white/5 transition-all duration-300 animate-fade-in"
    >
      <div className="relative aspect-square">
        {shouldRenderCanvas ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
                <Loader2 className="w-8 h-8 text-sky-300 animate-spin" />
              </div>
            }
          >
            <Canvas
              shadows={false}
              dpr={1}
              gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
              onCreated={({ gl }) => getKtx2Loader(gl).detectSupport(gl)}
            >
              <color attach="background" args={['#e1e7ef']} />
              <ambientLight intensity={1.5} />
              <directionalLight position={[5, 5, 5]} intensity={1.1} />
              <PerspectiveCamera makeDefault position={[0, 2, 4]} fov={45} />

              <Model
                modelUrl={modelUrl}
                overrideScale={scale}
                overridePosition={position}
              />

              {/* Desktop = interactive, Mobile = only autoRotate */}
              <OrbitControls
                enableZoom={false}
                enablePan={false}
                enableRotate={!isMobile}
                autoRotate
                autoRotateSpeed={1}
              />
            </Canvas>
          </Suspense>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 text-slate-200">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
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
