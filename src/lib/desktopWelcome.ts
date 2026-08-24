// Desktop first run: with no realm remembered the shell points the portal at
// the local, unenrolled node, which has nothing to serve. The welcome view owns
// the window until `validate_realm` gives the shell a realm to reopen against.
import type { Router } from 'vue-router'
import { portalConfig } from './config'
import { isDesktop } from './desktop'
import { realmUnreachable } from './desktopBoot'

// Survives the window replacement (same origin), so an interrupted connect can
// still be named on the way back.
const PENDING_KEY = 'aruna.desktop.connecting'

// A shell command that never answers must not hold the window: navigation
// continues, and the app's own realm probe surfaces a realm that is not there.
const STATUS_TIMEOUT_MS = 5_000

function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Aruna Desktop did not answer.')), ms)
  })
  return Promise.race([work, limit]).finally(() => clearTimeout(timer))
}

/** True once the portal has a realm to talk to; an unusable shell answers true. */
export async function realmKnown(): Promise<boolean> {
  if (!isDesktop()) return true
  try {
    const { nodeStatus } = await import('./desktopBridge')
    const status = await bounded(nodeStatus(), STATUS_TIMEOUT_MS)
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
    // A realm that never answered must be replaceable, remembered or not.
    if (to.name === 'welcome' && realmUnreachable()) return true
    if (known === null) known = await realmKnown()
    if (known) {
      setPendingRealm(null)
      return to.name === 'welcome' ? { name: 'dashboard' } : true
    }
    // The device page enrolls from a code alone, so it stays reachable.
    return to.name === 'welcome' || to.name === 'device' ? true : { name: 'welcome' }
  })
}

/**
 * True when the typed address names plain http on a non-loopback host. The
 * portal's PKCE sign-in needs a secure context, so that connect would dead-end
 * in the browser; loopback hosts and *.localhost stay secure contexts.
 */
export function insecureRealm(input: string): boolean {
  const address = input.trim()
  if (!/^http:\/\//i.test(address)) return false
  try {
    const host = new URL(address).hostname
    return !(
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '[::1]' ||
      /^127(\.\d{1,3}){3}$/.test(host)
    )
  } catch {
    return false
  }
}
