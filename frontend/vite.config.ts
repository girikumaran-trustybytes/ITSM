import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Required for GitHub Pages project site deployment at /ITSM/
  base: '/ITSM/',
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        // Use BACKEND_URL environment variable when provided (useful for Docker Compose),
        // otherwise default to localhost for local development.
        target: process.env.BACKEND_URL || 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
})
