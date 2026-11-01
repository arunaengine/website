// Merges another account the person can sign in with into the signed-in one. The other
// account's tokens stay in memory, and both logins must be at most 5 minutes old.
import { ref, shallowRef } from 'vue'
import {
  ApiError,
  apiErrorMessage,
  apiRequest,
  attachSignIn,
  issueToken,
  listUserKeys,
  mergeAccount,
  publishUserKey,
  readVault,
  saveVault,
  signInHasNoAccount,
  type ApiClientOptions,
  type MergeAccountResponse,
  type UserDevicesResponse,
  type UserInfoResponse,
  type UserVaultHead,
} from '@/lib/api'
import { assertCurrentSession, refreshContext, userInfo } from './aruna/state'
import { refresh, replaceToken } from './aruna/session'
import { tokenClaims } from './aruna/renewal'
import { SignInCancelled, cancelPopup, popupSignIn } from './popupSignIn'

/** The server takes logins up to 5 minutes old; this leaves time for the request. */
const FRESH_SECS = 4 * 60
/** The other account's token is only needed for the merge. */
const OTHER_TOKEN_SECS = 15 * 60

export type MergeStep =
  | 'idle'
  | 'signing'
  | 'loading'
  | 'unregistered'
  | 'copy-vault'
  | 'vault-blocked'
  | 'confirm'
  | 'merging'
  | 'merged'
  | 'attached'

export interface OtherAccount {
  info: UserInfoResponse
  devices: number
  vault: UserVaultHead[]
  /** This account has a vault of its own. */
  ownVault: boolean
}

/** Seconds since the login a JWT descends from; null when it names none. */
export function loginAge(token: string, now = Date.now()): number | null {
  const time = tokenClaims(token)?.auth_time
  return typeof time === 'number' ? Math.floor(now / 1000) - time : null
}

/** True when the login of `token` leaves time for a request that takes 5 minutes at most. */
export function loginFresh(token: string): boolean {
  const age = loginAge(token)
  return age !== null && age <= FRESH_SECS
}

/** Short words for a refused merge or attach. */
export function mergeFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return apiErrorMessage(error)
  if (error.code === 'merge_refused') return `Merge refused: ${error.message}.`
  if (error.code === 'vault_present') return 'The vaults of the two accounts differ. Merge the vaults first.'
  if (error.code === 'role_conflict') {
    const role = /the role (.+?) of the other account/.exec(error.message)?.[1]
    return `The role ${role ? `"${role}" ` : ''}of that account would cut your own access. Remove it there first.`
  }
  if (error.status === 401) return 'That sign-in was refused. Sign in again.'
  if (error.status === 404) return 'This node does not know one of the accounts yet. Try again later.'
  if (error.status === 429) return 'Too many attempts. Wait a minute.'
  if (error.status === 503) return 'Merging is not available right now. Try again later.'
  return apiErrorMessage(error)
}

// The merge takes the other vault when this account holds every payload of it unchanged.
function vaultStep(theirs: UserVaultHead[], own: UserVaultHead[]): MergeStep {
  if (!theirs.length) return 'confirm'
  const held = new Set(own.map((head) => head.payload))
  const sent = new Set(theirs.map((head) => head.payload))
  if (own.every((head) => sent.has(head.payload))) return 'copy-vault'
  return theirs.every((head) => held.has(head.payload)) ? 'confirm' : 'vault-blocked'
}

export function useAccountMerge() {
  const step = ref<MergeStep>('idle')
  const failure = ref<string | null>(null)
  const other = shallowRef<OtherAccount | null>(null)
  const result = shallowRef<MergeAccountResponse | null>(null)
  let otherToken = ''
  let signInToken = ''
  let run = 0

  function reset(next: MergeStep = 'idle') {
    run++
    step.value = next
    other.value = null
    otherToken = ''
    signInToken = ''
  }

  function fail(error: unknown, next: MergeStep) {
    if (error instanceof DOMException && error.name === 'AbortError') return reset()
    step.value = next
    failure.value = error instanceof SignInCancelled ? null : mergeFailure(error)
  }

  // A run that was cancelled or whose session changed ends quietly.
  function guard(id: number, epoch: number) {
    if (id !== run) throw new DOMException('Cancelled.', 'AbortError')
    assertCurrentSession(epoch)
  }

  async function load(id: number, context: { epoch: number; client: ApiClientOptions }) {
    step.value = 'loading'
    const client = { baseUrl: context.client.baseUrl, token: otherToken }
    const [info, devices, vault, ownVault] = await Promise.all([
      apiRequest<UserInfoResponse>('/access/users/me', {}, client),
      apiRequest<UserDevicesResponse>('/access/users/me/devices', {}, client),
      readVault(client),
      readVault(context.client),
    ])
    guard(id, context.epoch)
    if (info.user.user_id === userInfo.value?.user.user_id) {
      reset()
      failure.value = 'This is the account you are signed in with.'
      return
    }
    other.value = { info, devices: devices.devices.length, vault: vault.heads, ownVault: ownVault.heads.length > 0 }
    step.value = vaultStep(vault.heads, ownVault.heads)
  }

  async function exchange(id: number, context: { epoch: number; client: ApiClientOptions }) {
    try {
      otherToken = await issueToken(signInToken, context.client.baseUrl ?? '', OTHER_TOKEN_SECS)
    } catch (error) {
      guard(id, context.epoch)
      if (signInHasNoAccount(error)) {
        step.value = 'unregistered'
        return
      }
      throw error
    }
    guard(id, context.epoch)
    await load(id, context)
  }

  /** Signs in with the other account; call it in a click handler. */
  async function start() {
    reset('signing')
    failure.value = null
    const id = run
    const context = refreshContext()
    try {
      const tokens = await popupSignIn()
      guard(id, context.epoch)
      signInToken = tokens.id_token ?? tokens.access_token
      await exchange(id, context)
    } catch (error) {
      if (id === run) fail(error, 'idle')
    }
  }

  // A login older than 5 minutes signs in again first; a token of another account is refused.
  async function ownClient(id: number, context: { epoch: number; client: ApiClientOptions }) {
    const token = context.client.token ?? ''
    if (loginFresh(token)) return context.client
    const tokens = await popupSignIn()
    guard(id, context.epoch)
    const baseUrl = context.client.baseUrl ?? ''
    const renewed = await issueToken(tokens.id_token ?? tokens.access_token, baseUrl)
    guard(id, context.epoch)
    const user = userInfo.value?.user
    if (tokenClaims(renewed)?.sub !== user?.user_id) {
      throw new Error(`You signed in with another account. Sign in as ${user?.name ?? 'yourself'}.`)
    }
    replaceToken(renewed)
    return { baseUrl, token: renewed }
  }

  // Publishes the newest key of the other account here, unless this account has it already.
  async function moveKey(id: number, context: { epoch: number; client: ApiClientOptions }) {
    const theirs = await listUserKeys(other.value?.info.user.user_id ?? '', { baseUrl: context.client.baseUrl, token: otherToken })
    guard(id, context.epoch)
    const key = theirs.keys[0]
    if (!key) return
    const own = await listUserKeys(userInfo.value?.user.user_id ?? '', context.client)
    guard(id, context.epoch)
    if (own.keys.some((held) => held.key_id === key.key_id && held.public_key === key.public_key)) return
    await publishUserKey({ key_id: key.key_id, public_key: key.public_key, has_recovery: key.has_recovery }, context.client)
  }

  /** Saves every payload of the other account's sealed vault here unchanged, with its key. */
  async function copyVault() {
    const account = other.value
    if (step.value !== 'copy-vault' || !account) return
    const id = run
    const context = refreshContext()
    failure.value = null
    step.value = 'loading'
    try {
      // A repeat after a failure saves only what did not arrive.
      const held = new Set((await readVault(context.client)).heads.map((head) => head.payload))
      guard(id, context.epoch)
      for (const head of account.vault) {
        if (held.has(head.payload)) continue
        await saveVault({ payload: head.payload, predecessors: [] }, context.client)
        held.add(head.payload)
        guard(id, context.epoch)
      }
      await moveKey(id, context)
      other.value = { ...account, ownVault: true }
      step.value = 'confirm'
    } catch (error) {
      if (id === run) fail(error, 'copy-vault')
    }
  }

  /** Merges after the confirmation; call it in a click handler, it may sign in again. */
  async function merge() {
    if (step.value !== 'confirm') return
    if (!loginFresh(otherToken)) {
      reset()
      failure.value = 'The other sign-in is older than 5 minutes. Start again.'
      return
    }
    const id = run
    const context = refreshContext()
    failure.value = null
    step.value = 'merging'
    try {
      const client = await ownClient(id, context)
      result.value = await mergeAccount(otherToken, client)
      guard(id, context.epoch)
      step.value = 'merged'
      otherToken = ''
      await refresh()
    } catch (error) {
      if (id === run) fail(error, 'confirm')
    }
  }

  /** Attaches a sign-in that has no account yet; call it in a click handler. */
  async function attach() {
    if (step.value !== 'unregistered') return
    if (!loginFresh(signInToken)) {
      reset()
      failure.value = 'That sign-in is older than 5 minutes. Add it again.'
      return
    }
    const id = run
    const context = refreshContext()
    failure.value = null
    step.value = 'loading'
    try {
      const client = await ownClient(id, context)
      await attachSignIn(signInToken, client)
      guard(id, context.epoch)
      reset('attached')
      await refresh()
    } catch (error) {
      if (id !== run) return
      if (error instanceof ApiError && error.code === 'subject_taken') {
        failure.value = 'This sign-in has its own account. You can merge it instead.'
        await exchange(id, context).catch((cause) => id === run && fail(cause, 'idle'))
        return
      }
      fail(error, 'unregistered')
    }
  }

  function cancel() {
    cancelPopup()
    reset()
    failure.value = null
    result.value = null
  }

  return { step, failure, other, result, start, copyVault, merge, attach, cancel }
}
