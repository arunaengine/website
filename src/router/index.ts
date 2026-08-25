import { createRouter, createWebHistory } from 'vue-router'
import { portalRoutes } from './routes'
import { installDesktopGuard } from '@/lib/desktopWelcome'

function hashTargetExists(hash: string): boolean {
  try {
    return Boolean(document.querySelector(hash))
  } catch {
    return false
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: portalRoutes(),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) {
      // Wait a tick so freshly mounted views can render the target element.
      return new Promise((resolve) => {
        window.setTimeout(() => {
          if (hashTargetExists(to.hash)) {
            resolve({ el: to.hash, top: 72, behavior: 'smooth' })
          } else {
            resolve({ top: 0 })
          }
        }, 0)
      })
    }
    return { top: 0 }
  },
})

// No-op on the web; in the shell it holds navigation at the welcome routes
// until the first run is done.
installDesktopGuard(router)

export default router
