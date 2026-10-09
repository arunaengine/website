import { apiRequest, defaultApiBaseUrl, type RealmInfoResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { loadMetadata, resetRecentOrderProbe } from './catalog'
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
// The live token the desktop shell moved to `baseUrl`; sent there only once it named `realmId`.
let carried: { token: string; realmId: string; baseUrl: string } | null = null

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
 * Restores a carried or stored token only after `/system/realm`, asked without a token,
 * named its realm at this API base, so no request carries a token stored for another realm
 * or API origin.
 */
async function restoreToken(context: ReturnType<typeof refreshContext>): Promise<void> {
  try {
    const realm = await apiRequest<RealmInfoResponse>('/system/realm', {}, { baseUrl: context.client.baseUrl })
    if (context.epoch !== sessionEpoch.value) return
    realmInfo.value = realm
    const held = carried?.baseUrl === context.client.baseUrl && carried.realmId === realm.realm_id ? carried.token : ''
    carried = null
    const stored = held || readStored(tokenKey(realm.realm_id, context.client.baseUrl))
    if (stored) setAuthToken(stored)
  } catch {
    // The realm is unknown, so the session stays signed out until a later refresh.
  }
}

export function refresh(): Promise<void> {
  const context = refreshContext()
  if (refreshInFlight?.epoch === context.epoch) return refreshInFlight.promise

  restoring.value = !context.client.token
    && (carried?.baseUrl === context.client.baseUrl || hasStoredToken(context.client.baseUrl))
  const promise = restoring.value
    ? restoreToken(context)
        .then(() => refreshForContext(refreshContext()))
        .finally(() => {
          restoring.value = false
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

// `keepToken` is the desktop shell moving this window between its own bases: the
// realm-issued token is valid on the local node too, so it returns once the new
// base names the same realm. Any other caller is addressing a foreign node.
export function setApiBaseUrl(url: string, options: { keepToken?: boolean } = {}) {
  const next = url.trim() || defaultApiBaseUrl()
  if (next === apiBaseUrl.value) return
  const realmId = realmInfo.value?.realm_id
  const live = authToken.value ? (realmId ? { token: authToken.value, realmId } : null) : carried
  carried = options.keepToken && live ? { token: live.token, realmId: live.realmId, baseUrl: next } : null
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
