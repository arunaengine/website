// One visit of a share link, without an account. The link token arrives in the URL fragment and
// leaves the address bar at once; it stays in this tab's session storage so a reload still works.
// The visit token lives in memory only and is opened again when it ends.
import { ref, shallowRef } from 'vue'
import { nodeApiBase } from '@/components/nodes/node-probe'
import { ApiError, apiRequest, defaultApiBaseUrl, openShare, type RealmInfoResponse, type VisitShare } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export type VisitPhase = 'opening' | 'password' | 'ready' | 'broken'

/** Opened again this long before the node would refuse the visit token. */
const RENEW_BEFORE_MS = 30_000

function storageKey(nodeId: string): string {
  return `aruna.share.${nodeId}`
}

function remembered(nodeId: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(nodeId))
  } catch {
    return null
  }
}

function remember(nodeId: string, token: string) {
  try {
    window.sessionStorage.setItem(storageKey(nodeId), token)
  } catch {
    // The visit still works until the tab reloads.
  }
}

/** The token from the fragment, which is then removed from the address bar and the history. */
export function takeLinkToken(nodeId: string): string | null {
  const token = window.location.hash.replace(/^#/, '').trim()
  if (!token) return remembered(nodeId)
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  remember(nodeId, token)
  return token
}

/** The node's API base from the realm's node list; the portal's own node when it is not listed. */
export async function resolveNodeBase(nodeId: string): Promise<string> {
  const base = defaultApiBaseUrl()
  try {
    const realm = await apiRequest<RealmInfoResponse>('/system/realm', {}, { baseUrl: base })
    const node = (realm.nodes ?? []).find((entry) => entry.node_id === nodeId)
    return (node && nodeApiBase(node)) || base
  } catch {
    return base
  }
}

export function isUnavailable(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 404 && cause.code === 'share_unavailable'
}

export function useShareVisit() {
  const phase = ref<VisitPhase>('opening')
  const share = shallowRef<VisitShare | null>(null)
  const error = ref<string | null>(null)
  const busy = ref(false)
  const baseUrl = ref('')
  let linkToken: string | null = null
  // Kept in memory so the visit can be opened again without asking twice.
  let password: string | undefined
  let visitToken = ''
  let visitEnds = 0

  async function start(nodeId: string) {
    phase.value = 'opening'
    linkToken = takeLinkToken(nodeId)
    if (!linkToken) {
      phase.value = 'broken'
      return
    }
    baseUrl.value = await resolveNodeBase(nodeId)
    await open()
  }

  async function open(entered?: string) {
    if (!linkToken) return
    if (entered !== undefined) password = entered
    busy.value = true
    error.value = null
    try {
      const answer = await openShare(linkToken, password, baseUrl.value)
      visitToken = answer.visit_token
      visitEnds = Date.parse(answer.expires_at)
      share.value = answer.share
      phase.value = 'ready'
    } catch (cause) {
      visitToken = ''
      if (isUnavailable(cause)) phase.value = 'broken'
      else if (cause instanceof ApiError && cause.code === 'password_required') {
        password = undefined
        phase.value = 'password'
      } else if (cause instanceof ApiError && cause.code === 'wrong_password') {
        password = undefined
        phase.value = 'password'
        error.value = 'The password is wrong.'
      } else if (cause instanceof ApiError && cause.status === 429) {
        error.value = 'Too many attempts. Wait a minute and try again.'
      } else {
        error.value = errorMessage(cause)
      }
    } finally {
      busy.value = false
    }
  }

  /** Runs one visitor request with a current visit token; an ended link turns the page broken. */
  async function visit<T>(call: (token: string, base: string) => Promise<T>): Promise<T> {
    if (!visitToken || Date.now() >= visitEnds - RENEW_BEFORE_MS) await open()
    if (phase.value !== 'ready') throw new Error('The link is not open.')
    try {
      return await call(visitToken, baseUrl.value)
    } catch (cause) {
      if (!isUnavailable(cause)) throw cause
      // The visit may have ended just now; a fresh one tells an ended link apart.
      await open()
      if (phase.value !== 'ready') throw cause
      return call(visitToken, baseUrl.value)
    }
  }

  return { phase, share, error, busy, baseUrl, start, open, visit }
}
