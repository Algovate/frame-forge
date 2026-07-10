import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/frame-forge/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split stable vendor libraries into their own cacheable chunks so app
        // code changes don't bust the browser cache for React/i18n.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]react[\\/]|[\\/]react-dom[\\/]|[\\/]scheduler[\\/]/.test(id)) return 'react';
          if (/[\\/]i18next[\\/]|[\\/]react-i18next[\\/]/.test(id)) return 'i18n';
          return undefined;
        },
      },
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})
