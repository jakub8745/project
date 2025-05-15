import * as THREE from 'three';

// Constants for models
export const MODEL_TYPES = {
  ROOM: 'room',
  ARTWORK: 'artwork',
  SCULPTURE: 'sculpture',
};

// Helper to create a simple room model geometrically
// (This would be replaced with actual 3D models in a production app)
export const createRoomGeometry = () => {
  const room = new THREE.Group();
  
  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: '#1a1a2e' })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2;
  room.add(floor);
  
  // Walls
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(10, 4, 10),
    new THREE.MeshStandardMaterial({ 
      color: '#1e1e2e',
      side: THREE.BackSide,
    })
  );
  walls.position.y = 0;
  room.add(walls);
  
  return room;
};

// Helper to get a color based on index for consistent coloring
export const getColorFromIndex = (index: number): THREE.Color => {
  const hue = (index * 30) % 360;
  return new THREE.Color(`hsl(${hue}, 70%, 60%)`);
};