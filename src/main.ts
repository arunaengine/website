import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { bootRuntimeConfig } from './lib/desktop'
import { isChunkError, recoverFromChunkError } from './lib/chunk-recovery'
import { reportGlobalError } from './composables/useGlobalErrors'
import './assets/main.css'

router.onError((error, to) => {
  if (!isChunkError(error)) return
  if (!recoverFromChunkError(to.fullPath)) {
    reportGlobalError('This page failed to load after an update, please reload the tab.')
  }
})

// Vite fires this for failed <link rel=modulepreload> fetches of stale chunks.
// It races the router error, so reload toward the in-flight destination.
let pendingTarget: string | null = null
router.beforeEach((to) => {
  pendingTarget = to.fullPath
})
router.afterEach(() => {
  pendingTarget = null
})
window.addEventListener('vite:preloadError', (event) => {
  const target = pendingTarget ?? window.location.pathname + window.location.search
  if (recoverFromChunkError(target)) event.preventDefault()
})

void bootRuntimeConfig().finally(() => {
  createApp(App).use(router).mount('#app')
})
