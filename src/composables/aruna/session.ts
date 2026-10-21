import { apiRequest, defaultApiBaseUrl, setSessionGate, type RealmInfoResponse } from '@/lib/api'
import { ownerNodeAllowed } from '@/lib/federation/transfer'
import { errorMessage } from '@/lib/utils'
import { loadMetadata, resetRecentOrderProbe } from './catalog'
import { bootstrapGate, closeGate, openGate, pendingGate } from './restoreGate'
import { loadAuthenticated } from './identity'
import { loadInfo } from './realm'
import {
  apiBaseKey,
  apiBaseUrl,
  apiGroups,
  authError,
  authRejected,
  authToken,
  bootstrapped,
  clearIdentityState,
  credentials,
  currentTokenKey,
  error,
  hasStoredToken,
  loading,
  readStored,
  realmInfo,
  refreshContext,
  refusedToken,
  restoring,
  sessionEpoch,
  storeValue,
  tokenKey,
  userInfo,
} from './state'

let refreshInFlight: { epoch: number; promise: Promise<void> } | null = null
// The live token the desktop shell moved to `baseUrl`, with the realm info trusted while it was live.
let carried: { token: string; realm: RealmInfoResponse; baseUrl: string } | null = null

async function refreshForContext(context: ReturnType<typeof refreshContext>): Promise<void> {
  loading.value = true
  error.value = null
  authError.value = null
  authRejected.value = false
  try {
    const [publicResult, authResult] = await Promise.allSettled([
      Promise.all([loadInfo(context), loadMetadata(context)]),
      context.client.token ? loadAuthenticated(context) : Promise.resolve(),
    ])
    if (context.epoch !== sessionEpoch.value) return
    if (publicResult.status === 'rejected') error.value = errorMessage(publicResult.reason)
    if (authResult.status === 'rejected') {
      if (context.client.token && refusedToken(authResult.reason)) {
        // The realm rejected the token (expired or revoked): drop the local
        // session so the portal shows its signed-out state, not a stale banner.
        forgetToken()
        authToken.value = ''
        clearIdentityState()
      } else if (context.client.token) {
        authError.value = errorMessage(authResult.reason)
        authRejected.value = false
        userInfo.value = null
        apiGroups.value = []
        credentials.value = []
      } else {
        apiGroups.value = []
      }
    } else if (!context.client.token) {
      userInfo.value = null
      credentials.value = []
    } else {
      // A login made before the realm was known is stored once it is.
      const key = currentTokenKey()
      if (key) storeValue(key, context.client.token)
    }
  } catch (err) {
    if (context.epoch === sessionEpoch.value) error.value = errorMessage(err)
  } finally {
    if (context.epoch === sessionEpoch.value) {
      loading.value = false
      bootstrapped.value = true
    }
  }
}

function forgetToken() {
  const key = currentTokenKey()
  if (key) storeValue(key, '')
}

/**
 * Whether the trusted `realm` lists `baseUrl` as a node API or the desktop shell names it as
 * its enrolled local node. What `baseUrl` itself answers never decides this.
 */
async function trustedBase(baseUrl: string, realm: RealmInfoResponse): Promise<boolean> {
  try {
    if (ownerNodeAllowed(baseUrl, realm)) return true
    const [{ nodeStatus }, { bounded, STATUS_TIMEOUT_MS }] = await Promise.all([
      import('@/lib/desktopBridge'),
      import('@/lib/desktopWelcome'),
    ])
    const local = await bounded(nodeStatus(), STATUS_TIMEOUT_MS)
    return local.enrolled && local.apiBaseUrl === baseUrl
  } catch {
    return false
  }
}

/**
 * Restores a carried or stored token only after `/system/realm`, asked without a token,
 * named its realm at this API base, so no request carries a token stored for another realm
 * or API origin.
 */
async function restoreToken(context: ReturnType<typeof refreshContext>): Promise<void> {
  try {
    const realm = await apiRequest<RealmInfoResponse>('/system/realm', {}, { baseUrl: context.client.baseUrl })
    if (context.epoch !== sessionEpoch.value) return
    realmInfo.value = realm
    const moved = carried?.baseUrl === context.client.baseUrl && carried.realm.realm_id === realm.realm_id ? carried : null
    const held = moved && (await trustedBase(moved.baseUrl, moved.realm)) ? moved.token : ''
    if (context.epoch !== sessionEpoch.value) return
    carried = null
    const stored = held || readStored(tokenKey(realm.realm_id, context.client.baseUrl))
    if (stored) setAuthToken(stored)
  } catch {
    // The realm is unknown, so the session stays signed out until a later refresh.
  }
}

if (restoring.value) bootstrapGate()
setSessionGate({
  pending: pendingGate,
  token: () => authToken.value,
  baseUrl: () => apiBaseUrl.value,
})

export function refresh(): Promise<void> {
  const context = refreshContext()
  if (refreshInFlight?.epoch === context.epoch) return refreshInFlight.promise

  restoring.value = !context.client.token
    && (carried?.baseUrl === context.client.baseUrl || hasStoredToken(context.client.baseUrl))
  const gate = restoring.value ? openGate() : null
  if (!gate) closeGate()
  const promise = gate
    ? restoreToken(context)
        .finally(() => closeGate(gate))
        .then(() => refreshForContext(refreshContext()))
        .finally(() => {
          // A restore that was left for another base must not end the pending state of the new one.
          if (context.epoch === sessionEpoch.value) restoring.value = false
          closeGate(gate)
        })
    : refreshForContext(context)
  refreshInFlight = { epoch: context.epoch, promise }
  void promise.finally(() => {
    if (refreshInFlight?.promise === promise) refreshInFlight = null
  }).catch(() => undefined)
  return promise
}

export function setAuthToken(token: string) {
  carried = null
  closeGate()
  const next = token.trim()
  if (next === authToken.value) return
  if (!next) forgetToken()
  sessionEpoch.value++
  authToken.value = next
  const key = currentTokenKey()
  if (key && next) storeValue(key, next)
  clearIdentityState()
  loading.value = false
  bootstrapped.value = false
}

// `keepToken` is the desktop shell moving this window between its own bases. The token returns
// once the new base names the same realm, and only if that realm lists the base as a node or
// the shell names it as its enrolled node. Any other caller is addressing a foreign node.
export function setApiBaseUrl(url: string, options: { keepToken?: boolean } = {}) {
  const next = url.trim() || defaultApiBaseUrl()
  if (next === apiBaseUrl.value) return
  const realm = realmInfo.value
  const live = authToken.value ? (realm ? { token: authToken.value, realm } : null) : carried
  carried = options.keepToken && live ? { token: live.token, realm: live.realm, baseUrl: next } : null
  sessionEpoch.value++
  // The token stays stored for its own realm and API origin; it is not sent to this one.
  // It goes first, so no watcher sees the new base together with the old token.
  authToken.value = ''
  apiBaseUrl.value = next
  storeValue(apiBaseKey(), apiBaseUrl.value === defaultApiBaseUrl() ? '' : apiBaseUrl.value)
  clearIdentityState(true)
  loading.value = false
  bootstrapped.value = false
  // A different node has to be probed for recency ordering again.
  resetRecentOrderProbe()
}
