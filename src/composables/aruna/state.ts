import { ref } from 'vue'
import {
  ApiError,
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

export const apiBaseUrl = ref(readStored(API_BASE_KEY) || defaultApiBaseUrl())
export const authToken = ref(readStored(TOKEN_KEY))
export const loading = ref(false)
export const saving = ref(false)
export const error = ref<string | null>(null)
export const authError = ref<string | null>(null)
// The realm refused this token, as opposed to never answering: only a refusal
// makes a stored session a signed-out one.
export const authRejected = ref(false)

export const nodeInfo = ref<InfoResponse | null>(null)
export const realmInfo = ref<RealmInfoResponse | null>(null)
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
export const acceptedProfileItems = new Map<string, MetadataDocumentListItem>()
export const bootstrapped = ref(false)
// Monotonic identity counter: bumped whenever the token or API base changes,
// so in-flight work and module-singleton caches can tell sessions apart.
export const sessionEpoch = ref(0)

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

export async function request<T>(path: string, options = {}) {
  const context = refreshContext()
  const response = await apiRequest<T>(path, options, context.client)
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
