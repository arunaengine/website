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
  build: {
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // Identity-carrying editor core must stay one chunk: a second
              // @codemirror/state or @lezer/highlight instance silently breaks
              // every extension (highlighting, theme, gutters).
              name: 'codemirror',
              test: /node_modules\/(@codemirror\/(state|view|language|commands|autocomplete|lint|search)|@lezer\/(common|highlight|lr)|style-mod|w3c-keyname|crelt)\//,
            },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    // Pre-bundle the whole editor stack eagerly: a mid-session dev
    // re-optimization can split @codemirror/@lezer into duplicate module
    // instances, which silently disables syntax highlighting.
    include: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/lang-python',
      '@codemirror/lang-javascript',
      '@codemirror/lang-json',
      '@codemirror/lang-css',
      '@codemirror/lang-rust',
      '@codemirror/lang-sql',
      '@codemirror/lang-xml',
      '@codemirror/lang-yaml',
      '@codemirror/legacy-modes/mode/shell',
      '@codemirror/legacy-modes/mode/toml',
      '@codemirror/legacy-modes/mode/properties',
      '@lezer/highlight',
    ],
  },
  server: {
    host: process.env.ARUNA_DEV_HOST || '127.0.0.1',
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
