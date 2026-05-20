import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // im LAN erreichbar (0.0.0.0)
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
})
