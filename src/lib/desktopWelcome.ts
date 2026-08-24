// Desktop first run: with no realm remembered the shell points the portal at
// the local, unenrolled node, which has nothing to serve. The welcome view owns
// the window until `validate_realm` gives the shell a realm to reopen against.
import type { Router } from 'vue-router'
import { portalConfig } from './config'
import { isDesktop } from './desktop'

// Survives the window replacement (same origin), so an interrupted connect can
// still be named on the way back.
const PENDING_KEY = 'aruna.desktop.connecting'

/** True once the portal has a realm to talk to; an unusable shell answers true. */
export async function realmKnown(): Promise<boolean> {
  if (!isDesktop()) return true
  try {
    const { nodeStatus } = await import('./desktopBridge')
    const status = await nodeStatus()
    const base = portalConfig().apiBaseUrl
    const local = status.apiBaseUrl ? base === status.apiBaseUrl : loopback(base)
    return status.enrolled || !local
  } catch {
    // A shell without that command half must not strand the owner here.
    return true
  }
}

function loopback(base: string): boolean {
  try {
    const host = new URL(base, 'http://desktop.invalid').hostname
    return host === '127.0.0.1' || host === '[::1]' || host === 'localhost'
  } catch {
    return false
  }
}

/** The realm a validate_realm call accepted, until the shell reopens on it. */
export function pendingRealm(): string | null {
  try {
    return window.localStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}

export function setPendingRealm(origin: string | null): void {
  try {
    if (origin) window.localStorage.setItem(PENDING_KEY, origin)
    else window.localStorage.removeItem(PENDING_KEY)
  } catch {
    /* the hint is optional; storage may be denied */
  }
}

/**
 * Sends desktop navigation to the welcome view while no realm is known, and
 * away from it once one is. Probed once per boot: the shell replaces the whole
 * window when the answer changes.
 */
export function installWelcomeGuard(router: Router): void {
  if (!isDesktop()) return
  let known: boolean | null = null
  router.beforeEach(async (to) => {
    // The system browser returns through the callback whatever else is true.
    if (to.name === 'auth-callback') return true
    if (known === null) known = await realmKnown()
    if (known) {
      setPendingRealm(null)
      return to.name === 'welcome' ? { name: 'dashboard' } : true
    }
    // The device page enrolls from a code alone, so it stays reachable.
    return to.name === 'welcome' || to.name === 'device' ? true : { name: 'welcome' }
  })
}
