// Desktop first run: with no realm remembered the shell points the portal at
// the local, unenrolled node, which has nothing to serve. The welcome view owns
// the window until `validate_realm` gives the shell a realm to reopen against.
import type { Router } from 'vue-router'
import { desktopContext, isDesktop } from './desktop'
import { realmUnreachable } from './desktopBoot'

// Survives the window replacement (same origin), so an interrupted connect can
// still be named on the way back.
const PENDING_KEY = 'aruna.desktop.connecting'

// The device setup prompt is answered once per realm, and the enrollment it
// applied is followed across the window replacement that ends it.
const SKIPPED_KEY = 'aruna.desktop.setupSkipped'
const WATCH_KEY = 'aruna.desktop.setupWatch'

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
  // The shell names the remembered realm; a loopback one is still a realm.
  if (desktopContext()?.realmUrl) return true
  try {
    const { nodeStatus } = await import('./desktopBridge')
    const status = await bounded(nodeStatus(), STATUS_TIMEOUT_MS)
    return status.enrolled
  } catch {
    // A shell without that command half must not strand the owner here.
    return true
  }
}

let enrolledOnce: boolean | null = null

/** True once the node the shell embeds joined a realm; probed once per boot. */
export async function deviceEnrolled(): Promise<boolean> {
  if (enrolledOnce !== null) return enrolledOnce
  try {
    const { nodeStatus } = await import('./desktopBridge')
    enrolledOnce = (await bounded(nodeStatus(), STATUS_TIMEOUT_MS)).enrolled
  } catch {
    // A shell that cannot answer must not hold the owner at the setup step.
    enrolledOnce = true
  }
  return enrolledOnce
}

/** Drops the probe, so a finished enrollment is seen without a restart. */
export function clearEnrolled(): void {
  enrolledOnce = null
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

// A device is set up against the realm it joins, so a second realm asks again.
function scoped(key: string): string {
  const realm = desktopContext()?.realmUrl
  if (!realm) return key
  try {
    return `${key}:${new URL(realm).origin}`
  } catch {
    return `${key}:${realm}`
  }
}

/** True once this realm's device setup was answered, by a skip or a join. */
export function setupSkipped(): boolean {
  try {
    return window.localStorage.getItem(scoped(SKIPPED_KEY)) === '1'
  } catch {
    return false
  }
}

export function skipSetup(): void {
  try {
    window.localStorage.setItem(scoped(SKIPPED_KEY), '1')
  } catch {
    /* the prompt returns on the next boot; storage may be denied */
  }
}

/** The enrollment applied to this device, until it joined the realm. */
export interface SetupWatch {
  enrollmentId: string | null
  expiresAt: number
}

export function setupWatch(): SetupWatch | null {
  try {
    const raw = window.localStorage.getItem(scoped(WATCH_KEY))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<SetupWatch>
    if (typeof value?.expiresAt !== 'number') return null
    const enrollmentId = typeof value.enrollmentId === 'string' ? value.enrollmentId : null
    return { enrollmentId, expiresAt: value.expiresAt }
  } catch {
    return null
  }
}

export function setSetupWatch(value: SetupWatch | null): void {
  try {
    const key = scoped(WATCH_KEY)
    if (value) window.localStorage.setItem(key, JSON.stringify(value))
    else window.localStorage.removeItem(key)
  } catch {
    /* the setup step falls back to asking again; storage may be denied */
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
