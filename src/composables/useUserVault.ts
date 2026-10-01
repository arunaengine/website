// The provider keys a user keeps on the node, sealed in this browser. The vault
// holders keep ciphertext heads; the master key stays here as a WebCrypto
// handle and is remembered in IndexedDB so one passphrase entry serves the
// whole browser until the user locks the keys or signs out. Several heads are
// merged once the key is known and saved with every merged head as predecessor.
import { ref, watch } from 'vue'
import {
  apiErrorMessage,
  deleteVault,
  readVault,
  saveVault,
  vaultConflicted,
  vaultUnsupported,
  type UserVaultHead,
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

interface Head {
  revision: string
  payload: VaultPayload
}

interface Merged {
  payload: VaultPayload
  providers: BrowserProvider[]
  revisions: string[]
}

const state = ref<VaultState>('absent')
const loaded = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const providers = ref<BrowserProvider[]>([])
const keyStore = browserKeyStore()
let payload: VaultPayload | null = null
/** What the holders returned, newest first. */
let heads: Head[] = []
/** The heads whose content `payload` holds; the next save replaces them. */
let predecessors: string[] = []
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
  heads = []
  predecessors = []
  masterKey = null
  providers.value = []
  state.value = 'absent'
  loaded.value = false
  loading.value = false
  error.value = null
}

function unlocked(merged: Merged, key: CryptoKey) {
  payload = merged.payload
  predecessors = merged.revisions
  masterKey = key
  providers.value = merged.providers
  state.value = 'unlocked'
  loaded.value = true
}

function parseHeads(list: UserVaultHead[]): Head[] {
  return list
    .map((head) => ({ revision: head.revision, payload: parseVaultPayload(head.payload) }))
    .sort((a, b) => (a.revision < b.revision ? 1 : a.revision > b.revision ? -1 : 0))
}

/**
 * The newest head the key opens, with the providers and keypairs of every head
 * the key opens, newer entries first. Other heads stay out of the merge.
 */
async function mergeHeads(list: Head[], key: CryptoKey): Promise<Merged> {
  let base: Merged | null = null
  for (const head of list) {
    let entries: BrowserProvider[]
    try {
      entries = await openProviders(head.payload, key)
    } catch (cause) {
      if (cause instanceof VaultUnlockError) continue
      throw cause
    }
    if (!base) {
      base = { payload: head.payload, providers: entries, revisions: [head.revision] }
      continue
    }
    const keys = base.payload.keys
    const added = head.payload.keys.filter((entry) => !keys.some((known) => known.id === entry.id))
    base.payload = { ...base.payload, keys: [...keys, ...added] }
    base.providers = reapplyChange(entries, [], base.providers)
    base.revisions.push(head.revision)
  }
  if (!base) throw new VaultUnlockError('This key does not open the vault.')
  if (base.revisions.length > 1) base.payload = { ...base.payload, data: await sealData(key, { providers: base.providers }) }
  return base
}

/** Takes what the holders returned; with a key it merges, so true means a save is due. */
async function adoptHeads(list: UserVaultHead[], run: number, key = masterKey): Promise<boolean> {
  const parsed = parseHeads(list)
  const merged = key && parsed.length ? await mergeHeads(parsed, key) : null
  if (run !== generation) throw new Error(REPLACED)
  heads = parsed
  if (merged && key) {
    unlocked(merged, key)
    return merged.revisions.length > 1
  }
  payload = parsed[0]?.payload ?? null
  predecessors = parsed[0] ? [parsed[0].revision] : []
  return false
}

/** Puts what the node holds into place, opening it with a key this browser remembers. */
async function settle(scope: string, list: UserVaultHead[]): Promise<boolean> {
  if (!list.length) {
    heads = []
    predecessors = []
    payload = null
    masterKey = null
    providers.value = []
    state.value = 'absent'
    forgetKey(scope)
    return false
  }
  const run = generation
  const key = masterKey ?? await rememberedKey(scope)
  if (key) {
    try {
      return await adoptHeads(list, run, key)
    } catch (cause) {
      if (!(cause instanceof VaultUnlockError)) throw cause
      forgetKey(scope)
    }
  }
  await adoptHeads(list, run, null)
  masterKey = null
  providers.value = []
  state.value = 'locked'
  return false
}

/** Saves `next` over every held head and takes the heads the holder answers with. */
async function putPayload(next: VaultPayload, run: number): Promise<boolean> {
  const response = await saveVault({ payload: JSON.stringify(next), predecessors }, client())
  if (run !== generation) throw new Error(REPLACED)
  return adoptHeads(response.heads, run)
}

/** Saves a merge once; when that fails the next save carries the merge. */
async function saveMerge(run: number) {
  if (!payload) return
  try {
    await putPayload(payload, run)
  } catch {
    // The merged payload and its predecessors stay in place for the next save.
  }
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
      const mergeDue = await settle(scope, response.heads)
      if (run !== generation) return
      loaded.value = true
      if (mergeDue) await saveMerge(run)
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

/** Saves over the held heads; when a holder lost a concurrent write, rebuilds on a fresh read once. */
async function saveWithRetry(build: (current: VaultPayload) => Promise<VaultPayload>): Promise<void> {
  const run = generation
  requirePayload()
  for (let attempt = 0; ; attempt += 1) {
    const next = await build(requirePayload())
    try {
      if (await putPayload(next, run)) await saveMerge(run)
      return
    } catch (cause) {
      if (!vaultConflicted(cause) || attempt > 0 || run !== generation) throw cause
      const response = await readVault(client())
      if (run !== generation || !response.heads.length) throw new Error(REPLACED)
      await adoptHeads(response.heads, run)
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
  const response = await saveVault({ payload: JSON.stringify(created.payload), predecessors: [] }, client())
  if (run !== generation) throw new Error(REPLACED)
  await adoptHeads(response.heads, run, created.masterKey)
  await rememberKey(scope, created.masterKey)
  return created.recoveryCode
}

/** Tries the heads newest first, so a head saved with another passphrase does not block. */
async function unlockWith(open: (current: VaultPayload) => Promise<CryptoKey>) {
  const scope = requireScope()
  requirePayload()
  const run = generation
  let key: CryptoKey | null = null
  let failure: unknown = null
  for (const head of heads) {
    try {
      key = await open(head.payload)
      break
    } catch (cause) {
      if (!(cause instanceof VaultUnlockError)) throw cause
      failure ??= cause
    }
  }
  if (!key) throw failure
  const merged = await mergeHeads(heads, key)
  if (run !== generation) throw new Error(REPLACED)
  unlocked(merged, key)
  await rememberKey(scope, key)
  if (merged.revisions.length > 1) await saveMerge(run)
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
  // A save made at the same time on another holder outlives the delete.
  await settle(scope, (await readVault(client())).heads)
}

async function saveProviders(next: BrowserProvider[]): Promise<void> {
  const { key } = requireUnlocked()
  const base = providers.value
  try {
    await saveWithRetry(async (current) => {
      const merged = reapplyChange(await openProviders(current, key), base, next)
      return { ...current, data: await sealData(key, { providers: merged }) }
    })
  } catch (cause) {
    if (cause instanceof VaultUnlockError) {
      lock()
      throw new Error(REPLACED)
    }
    throw cause
  }
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
