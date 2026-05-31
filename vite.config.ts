import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined;
  }
  if (id.includes('/react-router-dom/')) {
    return 'router-vendor';
  }
  if (id.includes('/react-dom/') || id.includes('/react/')) {
    return 'react-vendor';
  }
  if (
    id.includes('/three-mesh-bvh/')
  ) {
    return 'three-bvh';
  }
  if (id.includes('/three/examples/')) {
    return 'three-examples';
  }
  if (id.includes('/three/')) {
    return 'three-core';
  }
  if (
    id.includes('/@react-three/') ||
    id.includes('/troika-') ||
    id.includes('/three-stdlib/') ||
    id.includes('/suspend-react/') ||
    id.includes('/zustand/')
  ) {
    return 'r3f-vendor';
  }
  if (id.includes('/lucide-react/')) {
    return 'ui-vendor';
  }
  return 'vendor';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = (env.VITE_CHAT_PROXY_TARGET || '').trim();
  const allowedHosts = (env.VITE_DEV_ALLOWED_HOSTS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    plugins: [react()],
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: false,
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
      proxy: proxyTarget
        ? {
            '/api/chat': {
              target: proxyTarget,
              changeOrigin: true
            }
          }
        : undefined
    },
    build: {
      rollupOptions: {
        input: 'index.html',
        output: {
          manualChunks
        }
      }
    }
  };
});
