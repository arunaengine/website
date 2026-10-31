import { computed, effectScope, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { nodeApiBase } from '@/components/nodes/node-probe'
import {
  ApiError,
  apiOrigin,
  apiRequest,
  defaultApiBaseUrl,
  type ApiGroup,
  type InfoResponse,
  type MetadataDocumentListItem,
  type ProfileValidationCapabilitiesResponse,
  type RealmInfoResponse,
  type S3CredentialSummary,
  type UsageResponse,
  type UserInfoResponse,
} from '@/lib/api'
import type { ParsedProfileControls } from '@/lib/profiles/rocrate'
import type { ProfileValidationPresentation } from './validation'

export const TOKEN_KEY = 'aruna.authToken'
export const API_BASE_KEY = 'aruna.apiBaseUrl'

// A saved override belongs to the portal whose served config saved it, so the portal of another
// realm on this browser origin ignores it before any token is restored.
export const apiBaseUrl = ref(readStored(apiBaseKey()) || defaultApiBaseUrl())
// Restored only once `/system/realm` named the realm at this API base; see `restoreToken`.
export const authToken = ref('')
// A token stored for this API origin waits for its realm; the session counts as pending.
export const restoring = ref(hasStoredToken())
export const loading = ref(false)
export const saving = ref(false)
export const error = ref<string | null>(null)
export const authError = ref<string | null>(null)
// The realm refused this token, as opposed to never answering: only a refusal
// makes a stored session a signed-out one.
export const authRejected = ref(false)

export const nodeInfo = ref<InfoResponse | null>(null)
export const realmInfo = ref<RealmInfoResponse | null>(null)
// The realm's name in its signed descriptor; empty until read or when none is set.
export const federationName = ref('')
export const usageInfo = ref<UsageResponse | null>(null)
export const userInfo = ref<UserInfoResponse | null>(null)
export const apiGroups = ref<ApiGroup[]>([])
export const metadataItems = ref<MetadataDocumentListItem[]>([])
export const profileItems = ref<MetadataDocumentListItem[]>([])
export const credentials = ref<S3CredentialSummary[]>([])
export const fullCrates = ref<Record<string, unknown>>({})
export const profileCrateParses = ref<Record<string, ParsedProfileControls>>({})
export const cratePending = ref<Record<string, boolean>>({})
export const profileValidationStatuses = ref<Record<string, ProfileValidationPresentation>>({})
export const profileValidationCapabilities = ref<ProfileValidationCapabilitiesResponse | null>(null)
// Invalidation fence for the crate cache: a load captures its document's
// generation before the first request and commits only when it still matches,
// so a fetch already in flight when a write invalidated the document cannot
// re-cache the replaced graph. The loads map keeps concurrent consumers on one
// shared request instead of stacking their own materialization polls.
export const crateGenerations = new Map<string, number>()
export const crateLoads = new Map<string, Promise<unknown>>()
export const profileCrateLoads = new Map<string, Promise<ParsedProfileControls>>()
export const profileValidationStatusGenerations = new Map<string, number>()
export const profileValidationStatusLoads = new Map<
  string,
  { generation: number; promise: Promise<ProfileValidationPresentation> }
>()
let profileValidationCapabilitiesLoad: Promise<ProfileValidationCapabilitiesResponse> | null = null
export const recentlyCreatedMetadataIds = new Set<string>()
// Each accepted change of a dataset, in order, so the database list rereads the ones it shows.
export const datasetChanges = ref<string[]>([])
export const acceptedProfileItems = new Map<string, MetadataDocumentListItem>()
export const bootstrapped = ref(false)
// Monotonic identity counter: bumped whenever the token or API base changes,
// so in-flight work and module-singleton caches can tell sessions apart.
export const sessionEpoch = ref(0)
/** The signed-in session, or -1 signed out; a renewal that replaces the token keeps it. */
export const signedInEpoch = computed(() => (authToken.value ? sessionEpoch.value : -1))
// The session whose realm document was read with its token; only that one names the nodes.
export const realmReadEpoch = ref(-1)

/** The saved API override of the portal whose served config names `servedBase`. */
export function apiBaseKey(servedBase = defaultApiBaseUrl()): string {
  return `${API_BASE_KEY}:${servedBase}`
}

/** The stored token of one realm at one API origin; realm portals may share a browser origin. */
export function tokenKey(realmId: string, baseUrl = apiBaseUrl.value): string {
  return `${TOKEN_KEY}:${realmId}@${apiOrigin(baseUrl)}`
}

/** The token key of the realm the current API base serves, once it is known. */
export function currentTokenKey(): string | null {
  return typeof window !== 'undefined' && realmInfo.value ? tokenKey(realmInfo.value.realm_id) : null
}

/** Whether a token of any realm is stored for the API origin of `baseUrl`. */
export function hasStoredToken(baseUrl?: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const suffix = `@${apiOrigin(baseUrl ?? apiBaseUrl.value)}`
    return Object.keys(window.localStorage).some((key) => key.startsWith(`${TOKEN_KEY}:`) && key.endsWith(suffix))
  } catch {
    return false
  }
}

export function readStored(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function capabilitiesLoad(): Promise<ProfileValidationCapabilitiesResponse> | null {
  return profileValidationCapabilitiesLoad
}

export function setCapabilitiesLoad(load: Promise<ProfileValidationCapabilitiesResponse> | null) {
  profileValidationCapabilitiesLoad = load
}

export function storeValue(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    // The live in-memory session still works when storage is unavailable.
  }
}

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

/** This session's client for one node, which checks the token itself; no node is the connected one. */
export function nodeClient(nodeId?: string | null) {
  const local = !nodeId || nodeId === nodeInfo.value?.node.peer_id
  const node = local ? null : (realmInfo.value?.nodes ?? []).find((entry) => entry.node_id === nodeId)
  const baseUrl = local ? apiBaseUrl.value : node ? nodeApiBase(node) : null
  if (!baseUrl) throw new Error('The node publishes no API address.')
  return { baseUrl, token: authToken.value }
}

/**
 * `nodeClient` once the realm can name the node; a fresh load reads it first without a token.
 * Fails with an AbortError when the session that asked ends, `signal` aborts or its scope ends.
 */
export async function nodeClientReady(nodeId?: string | null, epoch = sessionEpoch.value, signal?: AbortSignal) {
  const ended = () => epoch !== sessionEpoch.value
  const settled = () =>
    !nodeId || nodeId === nodeInfo.value?.node.peer_id || !authToken.value
    || realmReadEpoch.value === sessionEpoch.value
    || (realmInfo.value?.nodes ?? []).some((node) => node.node_id === nodeId)
  if (!settled() && !ended()) await settledWhen(() => settled() || ended(), signal)
  signal?.throwIfAborted()
  assertCurrentSession(epoch)
  return nodeClient(nodeId)
}

// The watch runs in its own scope, so a disposed owner cannot freeze it; that disposal or an
// abort settles the wait with an AbortError and stops the watch.
function settledWhen(done: () => boolean, signal?: AbortSignal) {
  const owner = getCurrentScope()
  return new Promise<void>((resolve, reject) => {
    const waiter = effectScope(true)
    const finish = (error?: unknown) => {
      waiter.stop()
      signal?.removeEventListener('abort', aborted)
      if (error) reject(error)
      else resolve()
    }
    const aborted = () => finish(new DOMException('The wait was cancelled.', 'AbortError'))
    if (signal?.aborted) return aborted()
    signal?.addEventListener('abort', aborted, { once: true })
    if (owner) onScopeDispose(aborted)
    waiter.run(() => watch(done, (ready) => ready && finish()))
  })
}

/** One request of this session, to the connected node unless another is named. */
export async function request<T>(path: string, options = {}, nodeId?: string | null) {
  const context = refreshContext()
  const client = nodeId ? await nodeClientReady(nodeId, context.epoch) : context.client
  assertCurrentSession(context.epoch)
  const response = await apiRequest<T>(path, options, client)
  assertCurrentSession(context.epoch)
  return response
}

export function refreshContext() {
  return { epoch: sessionEpoch.value, client: client() }
}

export function clearIdentityState(clearPublic = false) {
  userInfo.value = null
  apiGroups.value = []
  credentials.value = []
  metadataItems.value = []
  profileItems.value = []
  fullCrates.value = {}
  profileCrateParses.value = {}
  cratePending.value = {}
  profileValidationStatuses.value = {}
  profileValidationCapabilities.value = null
  crateGenerations.clear()
  crateLoads.clear()
  profileCrateLoads.clear()
  profileValidationStatusGenerations.clear()
  profileValidationStatusLoads.clear()
  profileValidationCapabilitiesLoad = null
  recentlyCreatedMetadataIds.clear()
  acceptedProfileItems.clear()
  authError.value = null
  authRejected.value = false
  if (clearPublic) {
    nodeInfo.value = null
    realmInfo.value = null
    federationName.value = ''
    usageInfo.value = null
  }
}

// 401 and 403 are the realm rejecting the token; anything else (transport,
// 5xx, a node still starting) leaves the session unproven, not signed out.
export function refusedToken(reason: unknown): boolean {
  return reason instanceof ApiError && (reason.status === 401 || reason.status === 403)
}

export function assertCurrentSession(epoch: number) {
  if (epoch !== sessionEpoch.value) throw new DOMException('The API session changed.', 'AbortError')
}
