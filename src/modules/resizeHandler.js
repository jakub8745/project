export function setupResizeHandler(renderer, camera) {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
  
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
  }
  