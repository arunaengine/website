// Desktop boot health. A remembered realm whose API cannot be reached must be
// named, not waited on: the app probes it on the way in and repeats before it
// condemns one, so a slow realm still boots and only sustained transport
// failure is a dead realm.
import { readonly, ref } from 'vue'
import { portalConfig } from './config'
import { desktopContext, isDesktop } from './desktop'
import { fetchWithTimeout } from './fetch'

// One attempt is bounded far below the API client's 30s, and the ladder spans
// enough time that a realm still starting up answers within it.
const ATTEMPT_TIMEOUT_MS = 6_000
const BACKOFF_MS = [1_000, 2_000]

export type RealmReach = 'reachable' | 'probing' | 'unreachable'

const reach = ref<RealmReach>('reachable')
const failure = ref<string | null>(null)
let running = false

/** Boot state of the realm API; only ever leaves 'reachable' in the shell. */
export const realmReach = readonly(reach)

/** Why the last attempt failed, as the detail line of the blocking state. */
export const realmFailure = readonly(failure)

export function realmUnreachable(): boolean {
  return reach.value === 'unreachable'
}

/** The origin the portal talks to; follows the shell's context as it changes. */
export function realmOrigin(): string {
  const base = desktopContext()?.apiBaseUrl ?? portalConfig().apiBaseUrl
  try {
    return new URL(base, globalThis.location?.href).origin
  } catch {
    return base
  }
}

// Reachable means the origin answered with a JSON document: a proxy error page
// or a captive portal is not this realm's API, whatever status it carries.
async function unreachable(): Promise<string | null> {
  const url = `${portalConfig().apiBaseUrl.replace(/\/+$/, '')}/info`
  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, ATTEMPT_TIMEOUT_MS)
    JSON.parse(await response.text())
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => void globalThis.setTimeout(resolve, ms))
}

/**
 * Probes the realm API until it answers or the attempts run out, and doubles
 * as the retry. Outside the shell it does nothing: a browser tab is served by
 * the origin it is already on, and has no other realm to offer.
 */
export async function probeRealm(): Promise<void> {
  if (!isDesktop() || running) return
  running = true
  reach.value = 'probing'
  try {
    for (let attempt = 0; ; attempt++) {
      const error = await unreachable()
      if (!error) {
        failure.value = null
        reach.value = 'reachable'
        return
      }
      failure.value = error
      if (attempt >= BACKOFF_MS.length) break
      await pause(BACKOFF_MS[attempt])
    }
    reach.value = 'unreachable'
  } finally {
    running = false
  }
}
