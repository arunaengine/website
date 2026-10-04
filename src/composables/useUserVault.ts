// The provider keys a user keeps on the node, sealed in this browser. The vault
// holders keep ciphertext heads; the master key stays here as a WebCrypto
// handle and is remembered in IndexedDB so one passphrase entry serves the
// whole browser until the user locks the keys or signs out. Several heads are
// merged once the key is known and saved with every merged head as predecessor.
import { computed, ref, shallowRef, watch } from 'vue'
import {
  apiErrorMessage,
  deleteVault,
  listUserKeys,
  publishUserKey,
  readVault,
  saveVault,
  vaultConflicted,
  vaultUnavailable,
  vaultUnsupported,
  type ApiClientOptions,
  type UserVaultHead,
} from '@/lib/api'
import { validateBrowserProvider, type BrowserProvider } from '@/lib/assistant/browserProviders'
import { assistantChatScopeKey } from '@/lib/assistant/chatHistory'
import {
  MIN_KEY_HOLDER_PASSPHRASE_LENGTH,
  VaultUnlockError,
  activeKeypair,
  changePassphrase as rewrapMaster,
  createVault,
  openData,
  openKeypair,
  parseVaultPayload,
  passphraseLongEnough,
  rotateKeypair,
  sealData,
  unlockVault,
  unlockWithRecovery as unwrapWithRecovery,
  type VaultPayload,
  type VaultSecret,
} from '@/lib/vault/crypto'
import type { X25519Pair } from '@/lib/vault/hpke'
import { browserKeyStore } from '@/lib/vault/keyStore'
import { apiBaseUrl, authToken, realmInfo, sessionEpoch, userInfo } from './aruna/state'

export type VaultState = 'absent' | 'locked' | 'unlocked' | 'unsupported'
/**
 * The key directory check after an unlock. `mismatch`: the newest published key is
 * not one of this vault's keys. `unavailable`: the check or the publish did not finish.
 */
export type OwnKeyState = 'unknown' | 'matches' | 'mismatch' | 'unavailable'

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
const ownKey = ref<OwnKeyState>('unknown')
/** True while the vault comes from this browser's cache because no holder answered. */
const fromCache = ref(false)
/**
 * True once for a browser that unlocked a vault the holders no longer have and
 * never cached, which is a vault from before vaults moved to the holders.
 */
const recreateNotice = ref(false)
/** A recovery code and the id of the saved recovery block it opens. */
interface HeldRecovery {
  code: string
  block: string
}
/** The recovery code of a vault this account and session made, in memory only, until dismissed. */
const recovery = shallowRef<HeldRecovery | null>(null)
/** The held recovery code while the vault is unlocked; a lock hides it until the next unlock. */
const recoveryCode = computed(() => (state.value === 'unlocked' ? (recovery.value?.code ?? null) : null))
const NOTICE_PREFIX = 'aruna.vault.recreateNotice:'
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
let keyCheck: Promise<void> | null = null
/** Grows with every account or session change, unlike `generation`, which a lock advances too. */
let sessionGeneration = 0
/** Grows when a read, create, unlock or save starts, so an older follow-up read yields to it. */
let vaultWork = 0

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

/** The API base and token a vault write began with, and the account scope they belong to. */
interface WriteTarget {
  scope: string
  client: ApiClientOptions
}

function writeTarget(): WriteTarget {
  return { scope: currentScope(), client: client() }
}

/** True once a lock, or an account, session or API base change, ended the write. */
function writeEnded(run: number, target: WriteTarget): boolean {
  return run !== generation || target.scope !== currentScope()
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

function cacheHeads(scope: string, list: UserVaultHead[]) {
  if (!scope) return
  void keyStore?.saveHeads(scope, list).catch(() => {
    // Without a usable store there is no cache; the holders still have the vault.
  })
}

async function cachedHeads(scope: string): Promise<UserVaultHead[] | null> {
  try {
    return (await keyStore?.loadHeads(scope)) ?? null
  } catch {
    return null
  }
}

function noticeState(scope: string): string | null {
  try {
    return globalThis.localStorage?.getItem(NOTICE_PREFIX + scope) ?? null
  } catch {
    return null
  }
}

function storeNotice(scope: string, value: 'pending' | 'seen') {
  try {
    globalThis.localStorage?.setItem(NOTICE_PREFIX + scope, value)
  } catch {
    // Without storage the notice shows once per page load at most.
  }
}

function dismissRecreateNotice() {
  recreateNotice.value = false
  if (scopeKey) storeNotice(scopeKey, 'seen')
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
  sessionGeneration += 1
  inFlight = null
  keyCheck = null
  payload = null
  heads = []
  predecessors = []
  masterKey = null
  providers.value = []
  ownKey.value = 'unknown'
  fromCache.value = false
  recreateNotice.value = false
  recovery.value = null
  state.value = 'absent'
  loaded.value = false
  loading.value = false
  error.value = null
}

/** The id of a payload's recovery block: its salt and wrapped key, which a new block replaces. */
function recoveryBlock(current: VaultPayload | null): string | null {
  const block = current?.recovery
  return block ? [block.salt, block.nonce, block.wrapped].join('\u0000') : null
}

/** Drops a held recovery code once the vault in place carries another recovery block. */
function matchRecovery() {
  if (recovery.value && recovery.value.block !== recoveryBlock(payload)) recovery.value = null
}

function unlocked(merged: Merged, key: CryptoKey) {
  payload = merged.payload
  matchRecovery()
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
  cacheHeads(scopeKey, list)
  if (merged && key) {
    unlocked(merged, key)
    return merged.revisions.length > 1
  }
  payload = parsed[0]?.payload ?? null
  matchRecovery()
  predecessors = parsed[0] ? [parsed[0].revision] : []
  return false
}

/** Puts what the node holds into place, opening it with a key this browser remembers. */
async function settle(scope: string, list: UserVaultHead[]): Promise<boolean> {
  if (!list.length) {
    const run = generation
    const lost = await rememberedKey(scope) && !(await cachedHeads(scope))
    if (run !== generation) throw new Error(REPLACED)
    if (lost && noticeState(scope) !== 'seen') storeNotice(scope, 'pending')
    cacheHeads(scope, [])
    heads = []
    predecessors = []
    payload = null
    matchRecovery()
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
      // A lock or session change during the merge owns the remembered key now.
      if (run !== generation) throw new Error(REPLACED)
      forgetKey(scope)
    }
  }
  await adoptHeads(list, run, null)
  if (run !== generation) throw new Error(REPLACED)
  masterKey = null
  providers.value = []
  state.value = 'locked'
  return false
}

/** Saves `next` over every held head and takes the heads the holder answers with. */
async function putPayload(next: VaultPayload, run: number, target = writeTarget()): Promise<boolean> {
  if (writeEnded(run, target)) throw new Error(REPLACED)
  const response = await saveVault({ payload: JSON.stringify(next), predecessors }, target.client)
  if (run !== generation) throw new Error(REPLACED)
  return adoptHeads(response.heads, run)
}

/**
 * Compares the newest key in the directory with this vault's active keypair, opened
 * so its public key is known to match the private key. Publishes the active key when
 * the directory holds none or an older key of this vault.
 */
async function checkOwnKey(run: number) {
  const current = payload
  const key = masterKey
  const active = current && activeKeypair(current.keys)
  const userId = userInfo.value?.user.user_id
  const saved = active && heads.some((head) => head.payload.keys.some((entry) => entry.id === active.id))
  if (!current || !key || !active || !userId || !saved) {
    ownKey.value = 'unavailable'
    return
  }
  // A lock or a session change while this runs makes the answer stale.
  const stale = () => run !== generation || masterKey !== key
  try {
    await openKeypair(key, active)
    const newest = (await listUserKeys(userId, client())).keys[0]
    if (stale()) return
    if (newest?.public_key === active.public) {
      ownKey.value = 'matches'
      return
    }
    if (newest && !current.keys.some((entry) => entry.public === newest.public_key)) {
      ownKey.value = 'mismatch'
      return
    }
    await publishUserKey({ key_id: active.id, public_key: active.public, has_recovery: Boolean(current.recovery) }, client())
    if (!stale()) ownKey.value = 'matches'
  } catch {
    if (!stale()) ownKey.value = 'unavailable'
  }
}

/** One directory check at a time, so two callers never publish the same key twice. */
function checkOnce(run: number): Promise<void> {
  const check = keyCheck ?? checkOwnKey(run).finally(() => {
    if (keyCheck === check) keyCheck = null
  })
  keyCheck = check
  return check
}

/** Adds a keypair when the vault has none, saves it with any merge, then checks the directory. */
async function finishUnlock(run: number, saveDue: boolean) {
  if (payload && masterKey && !activeKeypair(payload.keys)) {
    const keys = await rotateKeypair(masterKey, payload.keys)
    if (run !== generation || !payload) return
    payload = { ...payload, keys }
    saveDue = true
  }
  if (saveDue) await saveMerge(run)
  if (run === generation) await checkOnce(run)
}

/** Saves a merge once; when that fails the next save carries the merge. */
async function saveMerge(run: number, target?: WriteTarget) {
  if (!payload) return
  try {
    await putPayload(payload, run, target)
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
  vaultWork += 1
  loading.value = true
  error.value = null
  const promise = (async () => {
    try {
      const response = await readVault(client())
      if (run !== generation) return
      const mergeDue = await settle(scope, response.heads)
      if (run !== generation) return
      fromCache.value = false
      recreateNotice.value = state.value === 'absent' && noticeState(scope) === 'pending'
      loaded.value = true
      if (state.value === 'unlocked') await finishUnlock(run, mergeDue)
    } catch (cause) {
      if (run !== generation) return
      if (vaultUnsupported(cause)) {
        state.value = 'unsupported'
        loaded.value = true
        return
      }
      if (vaultUnavailable(cause)) {
        const cached = await loadCached(scope, run)
        // A lock or a newer read during the cache read owns the state now.
        if (cached || run !== generation) return
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

/** Opens the heads this browser cached last; the directory check waits for the holders. */
async function loadCached(scope: string, run: number): Promise<boolean> {
  const cached = await cachedHeads(scope)
  if (run !== generation || !cached?.length) return false
  await settle(scope, cached)
  if (run !== generation) return false
  fromCache.value = true
  ownKey.value = 'unavailable'
  loaded.value = true
  return true
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
  const target = writeTarget()
  requirePayload()
  vaultWork += 1
  for (let attempt = 0; ; attempt += 1) {
    const next = await build(requirePayload())
    try {
      if (await putPayload(next, run, target)) await saveMerge(run, target)
      return
    } catch (cause) {
      if (!vaultConflicted(cause) || attempt > 0 || run !== generation) throw cause
      const response = await readVault(target.client)
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
  // Work started before the lock belongs to the unlocked vault: none of it may open it again.
  generation += 1
  inFlight = null
  loading.value = false
  keyCheck = null
  masterKey = null
  providers.value = []
  ownKey.value = 'unknown'
  state.value = payload ? 'locked' : 'absent'
  forgetKey(scope)
}

function requireHolderLength(passphrase: string) {
  if (!passphraseLongEnough(passphrase, true)) {
    throw new Error(`The passphrase needs at least ${MIN_KEY_HOLDER_PASSPHRASE_LENGTH} characters.`)
  }
}

async function create(passphrase: string, withRecovery: boolean): Promise<string | null> {
  const scope = requireScope()
  if (state.value === 'unsupported') throw new Error('This node cannot keep provider keys.')
  // Creating over a vault that could not be read would replace it.
  if (!loaded.value || error.value) {
    throw new Error('The provider keys on this node could not be read yet. Reload the page and try again.')
  }
  if (payload) throw new Error('Your provider keys are already set up.')
  requireHolderLength(passphrase)
  vaultWork += 1
  const run = generation
  const session = sessionGeneration
  const target = writeTarget()
  const created = await createVault(passphrase, withRecovery)
  created.payload.keys = await rotateKeypair(created.masterKey, [])
  if (writeEnded(run, target)) throw new Error(REPLACED)
  // Held before the save: when its answer is lost, a later read that finds this block shows it.
  const block = recoveryBlock(created.payload)
  const held = created.recoveryCode && block ? { code: created.recoveryCode, block } : null
  recovery.value = held
  const response = await saveVault({ payload: JSON.stringify(created.payload), predecessors: [] }, target.client)
  // The vault exists now, so its code stays for this account and session, also past a lock.
  if (session === sessionGeneration && target.scope === currentScope()) recovery.value = held
  if (run !== generation) throw new Error(REPLACED)
  await adoptHeads(response.heads, run, created.masterKey)
  if (run !== generation) throw new Error(REPLACED)
  if (noticeState(scope) === 'pending') dismissRecreateNotice()
  await rememberKey(scope, created.masterKey)
  await finishUnlock(run, false)
  return created.recoveryCode
}

/** Tries the heads newest first, so a head saved with another passphrase does not block. */
async function unlockWith(open: (current: VaultPayload) => Promise<CryptoKey>) {
  const scope = requireScope()
  requirePayload()
  vaultWork += 1
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
  await finishUnlock(run, merged.revisions.length > 1)
}

function unlock(passphrase: string): Promise<void> {
  return unlockWith((current) => unlockVault(current, passphrase))
}

function unlockWithRecovery(recoveryCode: string): Promise<void> {
  return unlockWith((current) => unwrapWithRecovery(current, recoveryCode))
}

/** The current passphrase or the recovery code proves the change; the keys stay unlocked. */
async function changePassphrase(secret: VaultSecret, newPassphrase: string): Promise<void> {
  requireHolderLength(newPassphrase)
  requirePayload()
  await saveWithRetry((current) => rewrapMaster(current, secret, newPassphrase))
}

/** Retires the active keypair, adds a new one and publishes it. */
async function rotateKey(): Promise<void> {
  const { key } = requireUnlocked()
  const run = generation
  await saveWithRetry(async (current) => ({ ...current, keys: await rotateKeypair(key, current.keys) }))
  if (run === generation) await checkOnce(run)
}

/** Checks the key directory again and waits for the answer and any publication. */
async function checkKey(): Promise<OwnKeyState> {
  if (state.value === 'unlocked') await checkOnce(generation)
  return ownKey.value
}

/** A check that stays true while the vault stays unlocked with the same key. */
function whileUnlocked(): () => boolean {
  const key = masterKey
  const run = generation
  return () => key !== null && masterKey === key && run === generation && state.value === 'unlocked'
}

/** Opens a keypair of the unlocked vault by id, retired ones included; null when it has none. */
async function openUserKey(keyId: string): Promise<X25519Pair | null> {
  const { current, key } = requireUnlocked()
  const entry = current.keys.find((candidate) => candidate.id === keyId)
  return entry ? openKeypair(key, entry) : null
}

/** Ends every read, unlock and key check already running, for good. */
function endRunningWork() {
  generation += 1
  inFlight = null
  loading.value = false
  keyCheck = null
}

async function reset(): Promise<void> {
  const scope = scopeKey
  const session = sessionGeneration
  // Work running before or during the deletion read the old vault; none of it may restore it.
  endRunningWork()
  await deleteVault(client())
  // The deletion belongs to this account and session; another one keeps its own state.
  if (session !== sessionGeneration) return
  endRunningWork()
  recovery.value = null
  payload = null
  masterKey = null
  providers.value = []
  state.value = 'absent'
  forgetKey(scope)
  const work = vaultWork
  // A save made at the same time on another holder outlives the delete.
  const response = await readVault(client())
  // A read, create, unlock or save that began meanwhile owns the state; this answer is older.
  if (session === sessionGeneration && work === vaultWork) await settle(scope, response.heads)
}

/** Drops the held recovery code once the user stored it. */
function dismissRecovery() {
  recovery.value = null
}

async function saveProviders(next: BrowserProvider[]): Promise<void> {
  const { key } = requireUnlocked()
  const base = providers.value
  const run = generation
  try {
    await saveWithRetry(async (current) => {
      const merged = reapplyChange(await openProviders(current, key), base, next)
      return { ...current, data: await sealData(key, { providers: merged }) }
    })
  } catch (cause) {
    if (cause instanceof VaultUnlockError) {
      // A lock or session change since the save began owns the vault; it stays as it is.
      if (run === generation) lock()
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
    ownKey,
    fromCache,
    recreateNotice,
    recoveryCode,
    load,
    create,
    unlock,
    unlockWithRecovery,
    lock,
    changePassphrase,
    reset,
    saveProviders,
    rotateKey,
    checkKey,
    openUserKey,
    whileUnlocked,
    dismissRecreateNotice,
    dismissRecovery,
  }
}
