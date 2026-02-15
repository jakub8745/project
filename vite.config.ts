import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = (env.VITE_CHAT_PROXY_TARGET || '').trim();

  return {
    plugins: [react()],
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: false,
      allowedHosts: ['92f0346c603e.ngrok-free.app'],
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
        input: 'index.html'
      }
    }
  };
});
