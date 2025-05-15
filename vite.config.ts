// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),


  ],

  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        // makes /viewer/index.html a valid entry point
        viewer: 'viewer/index.html'
      }
    }
  }
})
