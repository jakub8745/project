// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),


  ],
  server: {
    host: true,            // same as '0.0.0.0'
    port: 5173,            // adjust if you run on a different port
    strictPort: false,      // optional: set true if you don’t want Vite to pick another port
    allowedHosts: ['92f0346c603e.ngrok-free.app'],
  },

  build: {
  rollupOptions: {
    input: 'index.html'
  }
  }
})
