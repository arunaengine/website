import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const apiBaseUrl = process.env.VITE_ARUNA_API_BASE_URL?.trim()
const devProxyTarget = process.env.ARUNA_PROXY_TARGET || 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: apiBaseUrl
      ? undefined
      : {
          '/api': {
            // Dev-only fallback for same-origin /api/v1. Release builds should
            // set VITE_ARUNA_API_BASE_URL when they need a direct API URL.
            target: devProxyTarget,
            changeOrigin: true,
          },
        },
  },
})
