// The two answers to a first sign-in whose email or name matches an existing account: add the
// sign-in to that account, or create a new one anyway.
import { ref, watch } from 'vue'
import { ApiError, apiErrorMessage, apiRequest, attachSignIn, issueToken, signInHasNoAccount } from '@/lib/api'
import type { LoginOption } from '@/lib/config'
import { useAruna } from './useAruna'
import { accountMatch, adoptSession, type AccountMatch } from './useAuth'
import { loginFresh, mergeFailure } from './useAccountMerge'
import { SignInCancelled, popupSignIn } from './popupSignIn'

export const matchBusy = ref(false)
export const matchFailure = ref<string | null>(null)
/** The new sign-in is too old to attach or register; only a new sign-in helps. */
export const matchStale = ref(false)

const STALE = 'Your new sign-in is older than 5 minutes. Sign in again.'

// Another sign-in brings its own match, or none.
watch(accountMatch, () => {
  matchFailure.value = null
  matchStale.value = false
})

function failed(error: unknown, describe: (error: unknown) => string) {
  // A switch of realm or session ends the action quietly.
  if (error instanceof SignInCancelled || (error instanceof DOMException && error.name === 'AbortError')) return
  const stale = error instanceof ApiError && (error.status === 401 || error.code === 'merge_refused')
  matchStale.value = stale
  matchFailure.value = stale ? STALE : describe(error)
}

// The realm, session and match an action started with; once any changes, the action stops.
function fence(match: AccountMatch) {
  const { apiBaseUrl, sessionEpoch } = useAruna()
  const baseUrl = apiBaseUrl.value
  const epoch = sessionEpoch.value
  const check = () => {
    if (apiBaseUrl.value !== baseUrl || sessionEpoch.value !== epoch || accountMatch.value !== match) throw new SignInCancelled()
  }
  return { baseUrl, check }
}

function begin() {
  matchBusy.value = true
  matchFailure.value = null
  matchStale.value = false
}

/**
 * Signs in with the existing account in a popup, through `login` once chosen, and adds the new
 * sign-in to it. Call it in a click handler. Returns the route to continue to, or null.
 */
export async function joinExistingAccount(login?: LoginOption): Promise<string | null> {
  const match = accountMatch.value
  if (!match || matchBusy.value) return null
  if (!loginFresh(match.oidcToken)) {
    matchStale.value = true
    matchFailure.value = STALE
    return null
  }
  begin()
  const { baseUrl, check } = fence(match)
  try {
    const tokens = await popupSignIn(login)
    check()
    const token = await issueToken(tokens.id_token ?? tokens.access_token, baseUrl).catch((error: unknown) => {
      if (signInHasNoAccount(error)) throw new Error('That sign-in has no account either. Choose the one you used before.')
      if (error instanceof ApiError && error.status === 401) throw new Error('That sign-in was refused. Try again.')
      throw error
    })
    check()
    await attachSignIn(match.oidcToken, { baseUrl, token }).catch((error: unknown) => {
      if (!(error instanceof ApiError && error.code === 'subject_taken')) throw error
      throw new Error('Your new sign-in already has an account. Sign in with it instead.')
    })
    check()
    // An upstream login has no Keycloak session to end at sign-out.
    await adoptSession(token, login?.upstream ? undefined : tokens.id_token)
    // A newer match that arrived meanwhile keeps the choice open, so nothing navigates away.
    if (accountMatch.value !== match) return null
    accountMatch.value = null
    return match.redirectTo
  } catch (error) {
    failed(error, mergeFailure)
    return null
  } finally {
    matchBusy.value = false
  }
}

/** Creates a new account for the sign-in although one matches. */
export async function createNewAccount(): Promise<string | null> {
  const match = accountMatch.value
  if (!match || matchBusy.value) return null
  begin()
  const { baseUrl, check } = fence(match)
  try {
    const client = { baseUrl, token: match.oidcToken }
    const body = JSON.stringify({ create_new: true })
    await apiRequest('/access/users/register', { method: 'POST', body }, client)
    const token = await issueToken(match.oidcToken, baseUrl)
    check()
    await adoptSession(token, match.idToken)
    // A newer match that arrived meanwhile keeps the choice open, so nothing navigates away.
    if (accountMatch.value !== match) return null
    accountMatch.value = null
    return match.redirectTo
  } catch (error) {
    failed(error, apiErrorMessage)
    return null
  } finally {
    matchBusy.value = false
  }
}
