import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      // Windows Docker bind mounts don't propagate inotify events so polling
      // is required. Use a 2s interval with awaitWriteFinish to prevent the
      // rapid phantom-change detections that were causing continuous HMR
      // resets and wiping React state mid-stream.
      usePolling: true,
      interval: 2000,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 200,
      },
    },
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
