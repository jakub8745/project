import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
        input: 'index.html'
      }
    }
  };
});
