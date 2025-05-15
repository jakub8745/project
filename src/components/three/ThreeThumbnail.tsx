import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Box } from '@react-three/drei';
import { GalleryConfig } from '../../store/galleryStore';
import * as THREE from 'three';

interface ThreeThumbnailProps {
  gallery: GalleryConfig;
}

// Simple room model for the thumbnail
const RoomModel: React.FC<{ color?: string }> = ({ color = '#4338ca' }) => {
  const roomRef = useRef<THREE.Group>(null);
  
  useFrame(({ clock }) => {
    if (roomRef.current) {
      // Rotate the room slowly
      roomRef.current.rotation.y = clock.getElapsedTime() * 0.2;
    }
  });
  
  return (
    <group ref={roomRef}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#1e1e2e" />
      </mesh>
      
      {/* Walls */}
      <Box args={[4, 2, 4]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#1e1e2e" side={THREE.BackSide} />
      </Box>
      
      {/* Some simple exhibition pieces */}
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial color={color} />
      </mesh>
      
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.5, 1, 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
      
      {/* Small display stands */}
      {[-1, 1].map((x) => (
        <group key={`stand-${x}`} position={[x, -0.7, 0.8]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.6, 16]} />
            <meshStandardMaterial color="#2c2c3d" />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color="#6366f1" />
          </mesh>
        </group>
      ))}
    </group>
  );
};

const ThreeThumbnail: React.FC<ThreeThumbnailProps> = ({ gallery }) => {
  // Generate a deterministic color based on the gallery id
  const colorHue = (parseInt(gallery.id.split('-')[1]) * 30) % 360;
  const color = `hsl(${colorHue}, 70%, 60%)`;
  
  return (
    <div className="w-full h-full tile-canvas">
      <Canvas shadows dpr={[1, 2]}>
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[5, 5, 5]} 
          intensity={0.8} 
          castShadow 
          shadow-mapSize-width={1024} 
          shadow-mapSize-height={1024} 
        />
        
        <PerspectiveCamera 
          makeDefault 
          position={[0, 1, 4]} 
          fov={45}
        />
        
        <RoomModel color={color} />
        
        <OrbitControls 
          enableZoom={false}
          enablePan={false}
          enableRotate={false}
          autoRotate
          autoRotateSpeed={1}
        />
        
        <Environment preset="apartment" />
      </Canvas>
    </div>
  );
};

export default ThreeThumbnail;