import { defaultApiBaseUrl } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { loadMetadata, resetRecentOrderProbe } from './catalog'
import { loadAuthenticated } from './identity'
import { loadInfo } from './realm'
import {
  API_BASE_KEY,
  TOKEN_KEY,
  apiBaseUrl,
  apiGroups,
  authError,
  authRejected,
  authToken,
  bootstrapped,
  clearIdentityState,
  credentials,
  error,
  loading,
  refreshContext,
  refusedToken,
  sessionEpoch,
  storeValue,
  userInfo,
} from './state'

export async function refresh() {
  const context = refreshContext()
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
      if (context.client.token) {
        authError.value = errorMessage(authResult.reason)
        authRejected.value = refusedToken(authResult.reason)
        userInfo.value = null
        apiGroups.value = []
        credentials.value = []
      } else {
        apiGroups.value = []
      }
    } else if (!context.client.token) {
      userInfo.value = null
      credentials.value = []
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

export function setAuthToken(token: string) {
  const next = token.trim()
  if (next === authToken.value) return
  sessionEpoch.value++
  authToken.value = next
  storeValue(TOKEN_KEY, authToken.value)
  clearIdentityState()
  loading.value = false
}

// `keepToken` is the desktop shell moving this window between its own bases:
// the realm-issued token is valid on the local node too, so the session
// survives the switch. Any other caller is addressing a foreign node.
export function setApiBaseUrl(url: string, options: { keepToken?: boolean } = {}) {
  const next = url.trim() || defaultApiBaseUrl()
  if (next === apiBaseUrl.value) return
  sessionEpoch.value++
  apiBaseUrl.value = next
  storeValue(API_BASE_KEY, apiBaseUrl.value === defaultApiBaseUrl() ? '' : apiBaseUrl.value)
  if (!options.keepToken) {
    authToken.value = ''
    storeValue(TOKEN_KEY, '')
  }
  clearIdentityState(true)
  loading.value = false
  bootstrapped.value = false
  // A different node has to be probed for recency ordering again.
  resetRecentOrderProbe()
}
