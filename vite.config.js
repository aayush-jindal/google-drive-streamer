import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // Listen on 0.0.0.0 — needed for Docker + LAN access
    port: 5173,
    proxy: {
      // Forward /api/* to the local dev API server
      '/api': 'http://localhost:3001',
    },
  },
})
