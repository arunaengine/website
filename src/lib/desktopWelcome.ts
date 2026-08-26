// Desktop first run: with no realm remembered the shell points the portal at
// the local, unenrolled node, which has nothing to serve. The welcome routes
// own the window until `validate_realm` gives the shell a realm to switch to,
// the owner signed in, and the device prompt was answered.
import { watch, type Ref } from 'vue'
import { START_LOCATION, type RouteLocationNormalized, type RouteRecordName, type Router } from 'vue-router'
import { desktopContext, isDesktop, refreshShellContext, shellContext } from './desktop'
import { realmUnreachable } from './desktopBoot'

// The device setup prompt is answered once per realm, by a skip or a join.
const SKIPPED_KEY = 'aruna.desktop.setupSkipped'

// A shell command that never answers must not hold the window: navigation
// continues, and the app's own realm probe surfaces a realm that is not there.
const STATUS_TIMEOUT_MS = 5_000

// The shell reports the realm it switched to; the poll only covers an event
// that never arrived, and neither may hold the form for long.
const REALM_WAIT_MS = 5_000
const CONTEXT_POLL_MS = 500

/** Rejects when a shell command outlives its budget, so nothing waits on it. */
export function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
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

/** True once the node the shell embeds joined a realm; probed per context. */
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

function sameOrigin(one: string, other: string): boolean {
  try {
    return new URL(one).origin === new URL(other).origin
  } catch {
    return one === other
  }
}

// Only the realm this connect asked for ends it; changing realms starts from
// one the shell already names.
function namesRealm(origin: string): boolean {
  const realm = desktopContext()?.realmUrl
  return realm !== undefined && sameOrigin(realm, origin)
}

/** Resolves once the shell context names this realm, or the wait runs out. */
export function awaitRealm(origin: string, ms = REALM_WAIT_MS): Promise<boolean> {
  if (namesRealm(origin)) return Promise.resolve(true)
  return new Promise((resolve) => {
    let stop = () => {}
    const finish = (arrived: boolean) => {
      clearTimeout(timer)
      clearInterval(poll)
      stop()
      resolve(arrived)
    }
    const timer = setTimeout(() => finish(false), ms)
    const poll = setInterval(() => void refreshShellContext(), CONTEXT_POLL_MS)
    stop = watch(shellContext, () => {
      if (namesRealm(origin)) finish(true)
    })
  })
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

// A stored session is restored against the realm before the guard may call it
// signed out, but a slow realm must not hold the window either.
const BOOTSTRAP_TIMEOUT_MS = 10_000

const WELCOME_ROUTES = new Set<RouteRecordName>(['welcome', 'welcome-sign-in', 'welcome-device'])

// Resolves once the flag turns true, or once the wait runs out.
function settled(flag: Ref<boolean>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let stop = () => {}
    const finish = () => {
      clearTimeout(timer)
      stop()
      resolve()
    }
    const timer = setTimeout(finish, ms)
    stop = watch(flag, (done) => {
      if (done) finish()
    })
  })
}

// Signed out means no token, or a realm that refused the one held. A bootstrap
// that failed on transport proves nothing, so the window stays where it is and
// the realm probe surfaces a base that is not answering.
async function signedOut(): Promise<boolean> {
  const { useAruna } = await import('@/composables/useAruna')
  const { authToken, authRejected, bootstrapped, currentUser } = useAruna()
  if (!authToken.value) return true
  if (!bootstrapped.value) await settled(bootstrapped, BOOTSTRAP_TIMEOUT_MS)
  if (!bootstrapped.value || currentUser.value) return false
  return authRejected.value
}

let knownOnce: boolean | null = null

/**
 * Holds desktop navigation at the welcome routes until the app has a realm to
 * talk to, a signed-in owner, and an answer to the device prompt. Both probes
 * belong to the context they were made in: a context the shell reports drops
 * them and runs the navigation on its way again, so a deep link the shell
 * followed still lands where it was going.
 */
export function installDesktopGuard(router: Router): void {
  if (!isDesktop()) return
  // The navigation in flight, so a context change re-runs that one instead of
  // cancelling it in favour of where the window still stands.
  let pending: RouteLocationNormalized | null = null
  router.beforeEach((to) => {
    pending = to
    return true
  })
  router.afterEach(() => {
    pending = null
  })
  watch(shellContext, () => {
    knownOnce = null
    clearEnrolled()
    // Nothing has landed and nothing is on its way: the next navigation reads
    // the new context by itself.
    const target = pending ?? router.currentRoute.value
    if (!pending && target === START_LOCATION) return
    void router.replace({ path: target.path, query: target.query, hash: target.hash, force: true })
  })
  // A deep link the shell followed is a route change, never a reload; a
  // sign-in window closed early puts the sign-in button back.
  void import('./desktopEvents').then(({ onAuthCancelled, onShellNavigate }) => {
    void onShellNavigate((path) => void router.push(path))
    void onAuthCancelled(() => void import('@/composables/useAuth').then((auth) => auth.cancelSignIn()))
  })
  router.beforeEach(async (to) => {
    // The system browser returns through the callback whatever else is true.
    if (to.name === 'auth-callback') return true
    // A realm that never answered must be replaceable, remembered or not.
    if (to.name === 'welcome' && realmUnreachable()) return true
    if (knownOnce === null) knownOnce = await realmKnown()
    // The device page enrolls from a code alone, so it stays reachable.
    if (!knownOnce) return to.name === 'welcome' || to.name === 'device' ? true : { name: 'welcome' }
    if (await signedOut()) {
      // The realm step is done; only an explicit change reopens the form.
      const changing = to.name === 'welcome' && to.query.change !== undefined
      return changing || to.name === 'welcome-sign-in' ? true : { name: 'welcome-sign-in' }
    }
    if (to.name === 'device') return true
    if (!setupSkipped() && !(await deviceEnrolled())) {
      return to.name === 'welcome-device' ? true : { name: 'welcome-device' }
    }
    return WELCOME_ROUTES.has(to.name as RouteRecordName) ? { name: 'dashboard' } : true
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
