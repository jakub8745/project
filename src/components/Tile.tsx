// src/components/Tile.tsx
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Loader2 } from 'lucide-react';
import Model from './Model';
import ktx2Loader from '../loaders/ktx2Loader';

// Simple mobile check (can be improved with libs like react-responsive)
const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

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
}) => (
  <div className="bg-transparent border border-white/20 rounded-lg overflow-hidden hover:bg-white/5 transition-all duration-300 animate-fade-in">
    <div className="relative aspect-square">
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
            <Loader2 className="w-8 h-8 text-sky-300 animate-spin" />
          </div>
        }
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          onCreated={({ gl }) => ktx2Loader.detectSupport(gl)}
        >
          <color attach="background" args={['#e1e7ef']} />
          <ambientLight intensity={1.5} />
          <directionalLight position={[5, 5, 5]} intensity={1.1} castShadow />
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
    </div>
    <div className="p-4 bg-transparent">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-slate-200 mt-1">{description}</p>
    </div>
  </div>
);

export default Tile;
