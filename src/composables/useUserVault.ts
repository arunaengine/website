// The provider keys a user keeps on the node, sealed in this browser. The node
// holds ciphertext and a revision; the master key stays here as a WebCrypto
// handle and is remembered in IndexedDB so one passphrase entry serves the
// whole browser until the user locks the keys or signs out.
import { ref, watch } from 'vue'
import {
  apiErrorMessage,
  deleteVault,
  readVault,
  saveVault,
  vaultConflicted,
  vaultUnsupported,
} from '@/lib/api'
import { validateBrowserProvider, type BrowserProvider } from '@/lib/assistant/browserProviders'
import { assistantChatScopeKey } from '@/lib/assistant/chatHistory'
import {
  VaultUnlockError,
  changePassphrase as rewrapMaster,
  createVault,
  openData,
  parseVaultPayload,
  sealData,
  unlockVault,
  unlockWithRecovery as unwrapWithRecovery,
  type VaultPayload,
  type VaultSecret,
} from '@/lib/vault/crypto'
import { browserKeyStore } from '@/lib/vault/keyStore'
import { apiBaseUrl, authToken, realmInfo, sessionEpoch, userInfo } from './aruna/state'

export type VaultState = 'absent' | 'locked' | 'unlocked' | 'unsupported'

const REPLACED = 'Your provider keys were changed in another browser. Unlock them again.'
const SET_UP_ELSEWHERE = 'Your provider keys were set up in another browser. Reload the page and unlock them.'

const state = ref<VaultState>('absent')
const loaded = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const remoteRevision = ref(0)
const providers = ref<BrowserProvider[]>([])
const keyStore = browserKeyStore()
let payload: VaultPayload | null = null
let masterKey: CryptoKey | null = null
let scopeKey = ''
let generation = 0
let requested = false
let inFlight: Promise<void> | null = null

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

/** API base, realm and user, the same scope the chat store uses. */
function currentScope(): string {
  const token = authToken.value.trim()
  const userId = userInfo.value?.user.user_id ?? ''
  const realmId = userInfo.value?.realm.realm_id ?? realmInfo.value?.realm_id ?? ''
  if (!token || !userId || !realmId || !apiBaseUrl.value) return ''
  return assistantChatScopeKey({ apiBaseUrl: apiBaseUrl.value, realmId, userId })
}

async function rememberKey(scope: string, key: CryptoKey) {
  try {
    await keyStore?.save(scope, key)
  } catch {
    // Without a usable store the key lives in memory for this tab only.
  }
}

function forgetKey(scope: string) {
  if (!scope) return
  void keyStore?.remove(scope).catch(() => {
    // A store that cannot be written also could not have kept the key.
  })
}

function forgetKeys() {
  void keyStore?.clear().catch(() => {
    // Same as above: nothing was kept where nothing can be written.
  })
}

async function rememberedKey(scope: string): Promise<CryptoKey | null> {
  try {
    return (await keyStore?.load(scope)) ?? null
  } catch {
    return null
  }
}

async function openProviders(current: VaultPayload, key: CryptoKey): Promise<BrowserProvider[]> {
  const data = await openData(key, current)
  return data.providers.map((provider, index) => validateBrowserProvider(provider, `providers[${index}]`))
}

function clearLocal() {
  generation += 1
  inFlight = null
  payload = null
  masterKey = null
  providers.value = []
  remoteRevision.value = 0
  state.value = 'absent'
  loaded.value = false
  loading.value = false
  error.value = null
}

function unlocked(next: VaultPayload, key: CryptoKey, list: BrowserProvider[], revision: number) {
  payload = next
  masterKey = key
  providers.value = list
  remoteRevision.value = revision
  state.value = 'unlocked'
  loaded.value = true
}

/** Puts what the node holds into place, opening it with a key this browser remembers. */
async function settle(scope: string, response: { payload: string | null; revision: number }) {
  remoteRevision.value = response.revision
  if (response.payload === null) {
    payload = null
    masterKey = null
    providers.value = []
    state.value = 'absent'
    forgetKey(scope)
    return
  }
  const next = parseVaultPayload(response.payload)
  const key = masterKey ?? await rememberedKey(scope)
  if (key) {
    try {
      unlocked(next, key, await openProviders(next, key), response.revision)
      return
    } catch (cause) {
      if (!(cause instanceof VaultUnlockError)) throw cause
      forgetKey(scope)
    }
  }
  payload = next
  masterKey = null
  providers.value = []
  state.value = 'locked'
}

function load(): Promise<void> {
  requested = true
  const scope = currentScope()
  if (!scope) return Promise.resolve()
  if (inFlight && scope === scopeKey) return inFlight
  scopeKey = scope
  const run = generation
  loading.value = true
  error.value = null
  const promise = (async () => {
    try {
      const response = await readVault(client())
      if (run !== generation) return
      await settle(scope, response)
      if (run !== generation) return
      loaded.value = true
    } catch (cause) {
      if (run !== generation) return
      if (vaultUnsupported(cause)) {
        state.value = 'unsupported'
        loaded.value = true
        return
      }
      error.value = apiErrorMessage(cause)
    } finally {
      if (run === generation) {
        loading.value = false
        inFlight = null
      }
    }
  })()
  inFlight = promise
  return promise
}

function requireScope(): string {
  const scope = currentScope()
  if (!scope) throw new Error('Sign in to keep provider keys on this node.')
  return scope
}

function requirePayload(): VaultPayload {
  if (!payload) throw new Error('There are no provider keys on this node yet.')
  return payload
}

function requireUnlocked(): { current: VaultPayload; key: CryptoKey } {
  if (!payload || !masterKey || state.value !== 'unlocked') throw new Error('Unlock your provider keys first.')
  return { current: payload, key: masterKey }
}

/** Writes with the held revision; on a stale write the next payload is rebuilt on what the node holds now. */
async function saveWithRetry(build: (current: VaultPayload) => Promise<VaultPayload>): Promise<VaultPayload> {
  const run = generation
  let current = requirePayload()
  for (let attempt = 0; ; attempt += 1) {
    const next = await build(current)
    try {
      const response = await saveVault({ payload: JSON.stringify(next), revision: remoteRevision.value }, client())
      if (run !== generation) throw new Error(REPLACED)
      payload = next
      remoteRevision.value = response.revision
      return next
    } catch (cause) {
      if (!vaultConflicted(cause) || attempt > 0 || run !== generation) throw cause
      const response = await readVault(client())
      if (run !== generation || response.payload === null) throw new Error(REPLACED)
      current = parseVaultPayload(response.payload)
      payload = current
      remoteRevision.value = response.revision
    }
  }
}

/** The local edit, by provider id, on the list another browser may have changed since. */
export function reapplyChange(
  remote: BrowserProvider[],
  base: BrowserProvider[],
  next: BrowserProvider[],
): BrowserProvider[] {
  const removed = new Set(base.filter((entry) => !next.some((candidate) => candidate.id === entry.id)).map((entry) => entry.id))
  const changed = next.filter((candidate) => {
    const before = base.find((entry) => entry.id === candidate.id)
    return !before || JSON.stringify(before) !== JSON.stringify(candidate)
  })
  const kept = remote
    .filter((entry) => !removed.has(entry.id))
    .map((entry) => changed.find((candidate) => candidate.id === entry.id) ?? entry)
  const added = changed.filter((candidate) => !kept.some((entry) => entry.id === candidate.id))
  return [...kept, ...added]
}

function lock() {
  const scope = scopeKey
  masterKey = null
  providers.value = []
  state.value = payload ? 'locked' : 'absent'
  forgetKey(scope)
}

async function create(passphrase: string, withRecovery: boolean): Promise<string | null> {
  const scope = requireScope()
  if (state.value === 'unsupported') throw new Error('This node cannot keep provider keys.')
  // Creating over a vault that could not be read would replace it.
  if (!loaded.value || error.value) {
    throw new Error('The provider keys on this node could not be read yet. Reload the page and try again.')
  }
  if (payload) throw new Error('Your provider keys are already set up.')
  const run = generation
  const created = await createVault(passphrase, withRecovery)
  let response
  try {
    response = await saveVault({ payload: JSON.stringify(created.payload), revision: remoteRevision.value }, client())
  } catch (cause) {
    throw vaultConflicted(cause) ? new Error(SET_UP_ELSEWHERE) : cause
  }
  if (run !== generation) throw new Error(REPLACED)
  unlocked(created.payload, created.masterKey, [], response.revision)
  await rememberKey(scope, created.masterKey)
  return created.recoveryCode
}

async function unlockWith(open: (current: VaultPayload) => Promise<CryptoKey>) {
  const scope = requireScope()
  const current = requirePayload()
  const run = generation
  const key = await open(current)
  const list = await openProviders(current, key)
  if (run !== generation) throw new Error(REPLACED)
  unlocked(current, key, list, remoteRevision.value)
  await rememberKey(scope, key)
}

function unlock(passphrase: string): Promise<void> {
  return unlockWith((current) => unlockVault(current, passphrase))
}

function unlockWithRecovery(recoveryCode: string): Promise<void> {
  return unlockWith((current) => unwrapWithRecovery(current, recoveryCode))
}

/** The current passphrase or the recovery code proves the change; the keys stay unlocked. */
async function changePassphrase(secret: VaultSecret, newPassphrase: string): Promise<void> {
  requirePayload()
  await saveWithRetry((current) => rewrapMaster(current, secret, newPassphrase))
}

async function reset(): Promise<void> {
  const scope = scopeKey
  await deleteVault(client())
  payload = null
  masterKey = null
  providers.value = []
  state.value = 'absent'
  forgetKey(scope)
  // The node keeps counting revisions past the delete; the next create needs the one it holds.
  await settle(scope, await readVault(client()))
}

async function saveProviders(next: BrowserProvider[]): Promise<void> {
  const { key } = requireUnlocked()
  const base = providers.value
  let merged: BrowserProvider[] = next
  try {
    await saveWithRetry(async (current) => {
      merged = reapplyChange(await openProviders(current, key), base, next)
      return { ...current, data: await sealData(key, { providers: merged }) }
    })
  } catch (cause) {
    if (cause instanceof VaultUnlockError) {
      lock()
      throw new Error(REPLACED)
    }
    throw cause
  }
  providers.value = merged
}

// A token or node change forgets every remembered key, whether or not this
// tab loaded the vault; a realm or user change only starts over with what the
// node holds for the new scope.
watch(sessionEpoch, () => {
  scopeKey = ''
  clearLocal()
  forgetKeys()
}, { flush: 'sync' })
watch(currentScope, (scope) => {
  if (scope === scopeKey) return
  scopeKey = ''
  clearLocal()
  if (scope && requested) void load()
})

export function useUserVault() {
  return {
    state,
    loaded,
    loading,
    error,
    remoteRevision,
    providers,
    load,
    create,
    unlock,
    unlockWithRecovery,
    lock,
    changePassphrase,
    reset,
    saveProviders,
  }
}
