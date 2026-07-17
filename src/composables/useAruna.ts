import { computed, ref } from 'vue'
import type { Group, MetadataDoc, MetadataProfile, Node, Realm, SparqlResult, User } from '@/data/types'
import {
  ApiError,
  apiRequest,
  defaultApiBaseUrl,
  type AddGroupMemberRequest,
  type ApiGroup,
  type ApiRole,
  type ListUsersResponse,
  type CreateGroupRoleRequest,
  type CreateMetadataRequest,
  type CreateMetadataResponse,
  type CreateS3CredentialsRequest,
  type CreateS3CredentialsResponse,
  type GroupDetailResponse,
  type GroupMembersResponse,
  type GroupRolesResponse,
  type InfoResponse,
  type ListGroupsResponse,
  type ListMetadataResponse,
  type ListS3CredentialsResponse,
  type MetadataDocumentListItem,
  type MetadataDocumentSummary,
  type MetadataRoCrateResponse,
  type MetadataSearchOptions,
  type MetadataSearchResponse,
  type ReplaceMetadataRoCrateRequest,
  type RealmInfoResponse,
  type RealmQuotaConfig,
  type S3CredentialSummary,
  type ListSourceConnectorsResponse,
  type ListStagingJobsResponse,
  type SourceConnectorRequest,
  type SourceConnectorSummary,
  type StageBlobResponse,
  type StageBlobSubmission,
  type SparqlResponse,
  type UsageHistoryResolution,
  type UsageHistoryResponse,
  type UsageResponse,
  type UserInfoResponse,
  type UserSearchResponse,
  type GetUserResponse,
  type ResolveUserResult,
  type UnifiedSearchOptions,
  type UnifiedSearchResponse,
} from '@/lib/api'
import { parseProfileCrate, resolveProfileArtifacts } from '@/lib/profiles/rocrate'

const TOKEN_KEY = 'aruna.authToken'
const API_BASE_KEY = 'aruna.apiBaseUrl'

const apiBaseUrl = ref(readStored(API_BASE_KEY) || defaultApiBaseUrl())
const authToken = ref(readStored(TOKEN_KEY))
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const authError = ref<string | null>(null)

const nodeInfo = ref<InfoResponse | null>(null)
const realmInfo = ref<RealmInfoResponse | null>(null)
const usageInfo = ref<UsageResponse | null>(null)
const userInfo = ref<UserInfoResponse | null>(null)
const apiGroups = ref<ApiGroup[]>([])
const metadataItems = ref<MetadataDocumentListItem[]>([])
const profileItems = ref<MetadataDocumentListItem[]>([])
const credentials = ref<S3CredentialSummary[]>([])
const fullCrates = ref<Record<string, unknown>>({})
const cratePending = ref<Record<string, boolean>>({})
const bootstrapped = ref(false)
let sessionEpoch = 0

function readStored(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function storeValue(key: string, value: string) {
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

async function request<T>(path: string, options = {}) {
  const context = refreshContext()
  const response = await apiRequest<T>(path, options, context.client)
  assertCurrentSession(context.epoch)
  return response
}

function refreshContext() {
  return { epoch: sessionEpoch, client: client() }
}

function clearIdentityState(clearPublic = false) {
  userInfo.value = null
  apiGroups.value = []
  credentials.value = []
  metadataItems.value = []
  profileItems.value = []
  fullCrates.value = {}
  cratePending.value = {}
  authError.value = null
  if (clearPublic) {
    nodeInfo.value = null
    realmInfo.value = null
    usageInfo.value = null
  }
}

async function refresh() {
  const context = refreshContext()
  loading.value = true
  error.value = null
  authError.value = null
  try {
    const [publicResult, authResult] = await Promise.allSettled([
      Promise.all([loadInfo(context), loadMetadata(context)]),
      context.client.token ? loadAuthenticated(context) : Promise.resolve(),
    ])
    if (context.epoch !== sessionEpoch) return
    if (publicResult.status === 'rejected') error.value = errorMessage(publicResult.reason)
    if (authResult.status === 'rejected') {
      if (context.client.token) {
        authError.value = errorMessage(authResult.reason)
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
    if (context.epoch === sessionEpoch) error.value = errorMessage(err)
  } finally {
    if (context.epoch === sessionEpoch) {
      loading.value = false
      bootstrapped.value = true
    }
  }
}

async function loadInfo(context = refreshContext()) {
  // /info/usage is not deployed everywhere yet; hide the stats on failure.
  const [info, realm, usage] = await Promise.all([
    apiRequest<InfoResponse>('/info', {}, context.client),
    apiRequest<RealmInfoResponse>('/info/realm', {}, context.client),
    apiRequest<UsageResponse>('/info/usage', {}, context.client).catch(() => null),
  ])
  if (context.epoch !== sessionEpoch) return
  nodeInfo.value = info
  realmInfo.value = realm
  usageInfo.value = usage
}

// Right after a create, the RO-Crate graph projection can lag behind the
// document registry, so listing with include=summary briefly 500s. Retry a
// few times, then fall back to a summary-less list so the catalog still loads.
async function listMetadataPage(
  query: Record<string, string | number>,
  context = refreshContext(),
): Promise<ListMetadataResponse> {
  const attempts = 3
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await apiRequest<ListMetadataResponse>(
        '/metadata',
        { query: { include: 'summary', limit: 1000, ...query } },
        context.client,
      )
    } catch (err) {
      const transient = err instanceof ApiError && err.status >= 500
      if (transient && attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        continue
      }
      if (transient) {
        return apiRequest<ListMetadataResponse>(
          '/metadata',
          { query: { limit: 1000, ...query } },
          context.client,
        )
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

async function listMetadata(
  query: Record<string, string | number>,
  context = refreshContext(),
): Promise<ListMetadataResponse> {
  const documents: MetadataDocumentListItem[] = []
  let offset = 0
  let last: ListMetadataResponse | null = null
  do {
    last = await listMetadataPage({ ...query, offset }, context)
    documents.push(...last.documents)
    offset = last.offset + last.total_returned
  } while (last.total_returned > 0 && last.total_returned >= last.limit)

  return {
    documents,
    limit: last?.limit ?? 1000,
    offset: 0,
    total_returned: documents.length,
  }
}

async function loadMetadata(context = refreshContext()) {
  const catalog = await listMetadata({}, context)
  if (context.epoch !== sessionEpoch) return
  metadataItems.value = catalog.documents.filter((doc) => !doc.document_path.startsWith('profiles/'))
  profileItems.value = catalog.documents.filter((doc) => doc.document_path.startsWith('profiles/'))
}

async function loadAuthenticated(context = refreshContext()) {
  // /users/info is the authentication authority. Optional group and credential
  // capabilities must not turn a valid session into a signed-out one.
  const me = await apiRequest<UserInfoResponse>('/users/info', {}, context.client)
  if (context.epoch !== sessionEpoch) return
  userInfo.value = me
  const [groups, credentialList] = await Promise.allSettled([
    listGroups(context),
    apiRequest<ListS3CredentialsResponse>('/users/credentials', {}, context.client),
  ])
  if (context.epoch !== sessionEpoch) return
  apiGroups.value = groups.status === 'fulfilled' ? groups.value.groups : []
  credentials.value = credentialList.status === 'fulfilled' ? credentialList.value.credentials : []
}

async function listGroups(context = refreshContext()): Promise<ListGroupsResponse> {
  const groups: ApiGroup[] = []
  const limit = 1000
  let offset = 0
  while (true) {
    const page = await apiRequest<ListGroupsResponse>(
      '/groups',
      { query: { include: 'roles', limit, offset } },
      context.client,
    )
    groups.push(...page.groups)
    if (page.groups.length < limit) break
    offset += page.groups.length
  }
  if (context.epoch === sessionEpoch) apiGroups.value = groups
  return { groups }
}

// Thrown when the RO-Crate graph projection is still materializing after the
// polling window. This is a transient state, not a failure.
export class CrateNotReadyError extends Error {
  constructor(public documentId: string) {
    super('The RO-Crate is still being prepared. Try again in a moment.')
    this.name = 'CrateNotReadyError'
  }
}

function assertCurrentSession(epoch: number) {
  if (epoch !== sessionEpoch) throw new DOMException('The API session changed.', 'AbortError')
}

// Backoff while the graph projection materializes right after a create.
const CRATE_POLL_DELAYS_MS = [1000, 2000, 3000, 3000, 3000, 3000, 3000]

function setCratePending(documentId: string, pending: boolean) {
  cratePending.value = { ...cratePending.value, [documentId]: pending }
}

// A 503 from the rocrate export means the graph projection is still
// materializing (expected right after create), so poll with backoff instead
// of surfacing an error, and give up with CrateNotReadyError after ~20s.
async function loadRoCrate(documentId: string): Promise<unknown> {
  if (fullCrates.value[documentId]) return fullCrates.value[documentId]
  const context = refreshContext()
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        assertCurrentSession(context.epoch)
        const response = await apiRequest<MetadataRoCrateResponse>(
          `/metadata/${documentId}/rocrate`,
          { query: { view: 'full' } },
          context.client,
        )
        assertCurrentSession(context.epoch)
        // Public profile crates reference their artifacts on S3 instead of
        // embedding text; fetch that content once here so the synchronous
        // consumers (mapProfile, the dataset dialog) keep reading `text`.
        // Crates without external artifacts pass through untouched.
        const resolved = await resolveProfileArtifacts(response.rocrate)
        assertCurrentSession(context.epoch)
        fullCrates.value = { ...fullCrates.value, [documentId]: resolved }
        return resolved
      } catch (err) {
        const materializing = err instanceof ApiError && err.status === 503
        if (!materializing) throw err
        if (attempt >= CRATE_POLL_DELAYS_MS.length) throw new CrateNotReadyError(documentId)
        setCratePending(documentId, true)
        await new Promise((resolve) => setTimeout(resolve, CRATE_POLL_DELAYS_MS[attempt]))
      }
    }
  } finally {
    if (context.epoch === sessionEpoch) setCratePending(documentId, false)
  }
}

async function createMetadata(input: CreateMetadataRequest) {
  saving.value = true
  try {
    const summary = await request<CreateMetadataResponse>('/metadata', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    // The document is already created; a failing catalog refresh here (e.g. the
    // projection race) must not surface as a create failure.
    await loadMetadata().catch(() => undefined)
    return summary
  } finally {
    saving.value = false
  }
}

async function getMetadataDocument(documentId: string): Promise<MetadataDocumentSummary> {
  const context = refreshContext()
  const summary = await apiRequest<MetadataDocumentSummary>(
    `/metadata/${encodeURIComponent(documentId)}`,
    {},
    context.client,
  )
  assertCurrentSession(context.epoch)
  return summary
}

// Uncached, unresolved crate for editing (loadRoCrate caches and resolves
// profile artifacts, which must never be written back).
async function fetchRoCrateRaw(documentId: string): Promise<unknown> {
  const context = refreshContext()
  const response = await apiRequest<MetadataRoCrateResponse>(
    `/metadata/${encodeURIComponent(documentId)}/rocrate`,
    { query: { view: 'full' } },
    context.client,
  )
  assertCurrentSession(context.epoch)
  return response.rocrate
}

function invalidateCrate(documentId: string) {
  const { [documentId]: _removed, ...rest } = fullCrates.value
  fullCrates.value = rest
}

async function replaceMetadataRoCrate(
  documentId: string,
  input: ReplaceMetadataRoCrateRequest,
): Promise<MetadataDocumentSummary> {
  saving.value = true
  try {
    const summary = await request<MetadataDocumentSummary>(`/metadata/${encodeURIComponent(documentId)}/rocrate`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
    invalidateCrate(documentId)
    // The update is accepted; a failing catalog refresh (projection race) must
    // not surface as a save failure.
    await loadMetadata().catch(() => undefined)
    return summary
  } finally {
    saving.value = false
  }
}

async function deleteMetadataDocument(documentId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/metadata/${encodeURIComponent(documentId)}`, { method: 'DELETE' })
    invalidateCrate(documentId)
    metadataItems.value = metadataItems.value.filter((item) => item.document_id !== documentId)
    await loadMetadata().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

async function listGroupMetadata(groupId: string): Promise<ListMetadataResponse> {
  return listMetadata({ group_id: groupId })
}

// Favourites live in the user attribute ui.favourite_metadata_ids as a
// comma-separated id list (see backend user_preferences_from_attributes).
async function doToggleFavourite(documentId: string): Promise<void> {
  const current = userInfo.value?.preferences.favourite_metadata_ids ?? []
  const next = current.includes(documentId)
    ? current.filter((id) => id !== documentId)
    : [...current, documentId]
  const body = next.length
    ? { set_attributes: { 'ui.favourite_metadata_ids': next.join(',') } }
    : { remove_attributes: ['ui.favourite_metadata_ids'] }
  const updated = await request<UserInfoResponse>('/users/info', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  userInfo.value = updated // PATCH returns the full GetUserInfoResponse
}

// Serialize toggles: every call PATCHes the whole comma-joined attribute from
// the id list at run time, so concurrent toggles across documents would race
// (last write wins, silently reverting the other). Chaining forces each toggle
// to observe the prior one's committed userInfo. Per-call errors still
// propagate to the caller; the queue absorbs them so one failure can't wedge
// the chain.
let favouriteQueue: Promise<unknown> = Promise.resolve()
async function toggleFavourite(documentId: string): Promise<void> {
  const run = favouriteQueue.then(() => doToggleFavourite(documentId))
  favouriteQueue = run.catch(() => undefined)
  return run
}

async function updateUserProfile(input: {
  name?: string
  set_attributes?: Record<string, string>
  remove_attributes?: string[]
}) {
  saving.value = true
  try {
    await request<UserInfoResponse>('/users/info', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    await loadAuthenticated()
  } finally {
    saving.value = false
  }
}

async function setRealmQuota(config: RealmQuotaConfig): Promise<RealmQuotaConfig> {
  saving.value = true
  try {
    const stored = await request<RealmQuotaConfig>('/info/realm/quota', {
      method: 'PUT',
      body: JSON.stringify(config),
    })
    if (realmInfo.value) realmInfo.value = { ...realmInfo.value, quota: stored }
    return stored
  } finally {
    saving.value = false
  }
}

// Throws ApiError with status 409 and the server's verbatim message when the
// caller is over the owned-group cap.
async function createGroup(name: string): Promise<GroupDetailResponse> {
  saving.value = true
  try {
    const created = await request<GroupDetailResponse>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    await loadAuthenticated().catch(() => undefined)
    return created
  } finally {
    saving.value = false
  }
}

async function getGroup(groupId: string): Promise<GroupDetailResponse> {
  return request<GroupDetailResponse>(`/groups/${groupId}`)
}

async function getGroupUsage(groupId: string): Promise<UsageResponse> {
  return request<UsageResponse>(`/groups/${groupId}/usage`)
}

// STUB against the assumed #250 history endpoint (see api.ts). On today's
// backends this 404s; callers gate on featureEnabled('usageHistory') and
// treat 404/405 as "backend does not serve history yet".
async function getGroupUsageHistory(
  groupId: string,
  opts: { from?: string; to?: string; resolution?: UsageHistoryResolution } = {},
): Promise<UsageHistoryResponse> {
  return request<UsageHistoryResponse>(`/groups/${groupId}/usage/history`, { query: { ...opts } })
}

async function createS3Credentials(input: CreateS3CredentialsRequest): Promise<CreateS3CredentialsResponse> {
  saving.value = true
  try {
    const created = await request<CreateS3CredentialsResponse>('/users/credentials', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await loadAuthenticated().catch(() => undefined)
    return created
  } finally {
    saving.value = false
  }
}

async function revokeS3Credential(accessKeyId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/users/credentials/${encodeURIComponent(accessKeyId)}`, { method: 'DELETE' })
    await loadAuthenticated().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

// Source connectors registered on a group (GET /groups/{group_id}/connectors).
async function listGroupConnectors(groupId: string): Promise<ListSourceConnectorsResponse> {
  return request<ListSourceConnectorsResponse>(`/groups/${groupId}/connectors`)
}

async function getGroupConnector(groupId: string, connectorId: string): Promise<SourceConnectorSummary> {
  return request<SourceConnectorSummary>(`/groups/${groupId}/connectors/${encodeURIComponent(connectorId)}`)
}

async function createGroupConnector(
  groupId: string,
  input: SourceConnectorRequest,
): Promise<SourceConnectorSummary> {
  saving.value = true
  try {
    return await request<SourceConnectorSummary>(`/groups/${groupId}/connectors`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  } finally {
    saving.value = false
  }
}

// PUT replaces the whole connector, secrets included: an empty secret_config
// removes any stored credentials (there is no partial update on the backend).
async function replaceGroupConnector(
  groupId: string,
  connectorId: string,
  input: SourceConnectorRequest,
): Promise<SourceConnectorSummary> {
  saving.value = true
  try {
    return await request<SourceConnectorSummary>(
      `/groups/${groupId}/connectors/${encodeURIComponent(connectorId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    )
  } finally {
    saving.value = false
  }
}

async function deleteGroupConnector(groupId: string, connectorId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/groups/${groupId}/connectors/${encodeURIComponent(connectorId)}`, {
      method: 'DELETE',
    })
  } finally {
    saving.value = false
  }
}

// Synchronous one-shot staging: the node pulls source_path from the connector
// and materializes it as bucket/key (201 on success). Slow for big blobs —
// callers must show a running state. The axum route is literally "/staging/".
async function stageBlob(input: StageBlobSubmission): Promise<StageBlobResponse> {
  return request<StageBlobResponse>('/staging/', { method: 'POST', body: JSON.stringify(input) })
}

// STUB against the assumed #276 job registry (see api.ts). On today's backends
// this 404s; callers gate on featureEnabled('stagingJobs') and treat 404/405 as
// "backend does not keep a staging job registry yet".
async function listStagingJobs(): Promise<ListStagingJobsResponse> {
  return request<ListStagingJobsResponse>('/staging/jobs')
}

async function listGroupMembers(groupId: string): Promise<GroupMembersResponse> {
  return request<GroupMembersResponse>(`/groups/${groupId}/members`)
}

async function addGroupMember(groupId: string, input: AddGroupMemberRequest): Promise<GroupRolesResponse> {
  saving.value = true
  try {
    const response = await request<GroupRolesResponse>(`/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await loadAuthenticated().catch(() => undefined)
    return response
  } finally {
    saving.value = false
  }
}

async function removeGroupMember(groupId: string, userId: string, roleId?: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
      query: { role_id: roleId },
    })
    await loadAuthenticated().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

async function leaveGroup(groupId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/groups/${groupId}/leave`, { method: 'POST' })
    await loadAuthenticated().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

async function createGroupRole(groupId: string, input: CreateGroupRoleRequest): Promise<ApiRole> {
  saving.value = true
  try {
    const role = await request<ApiRole>(`/groups/${groupId}/roles`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await loadAuthenticated().catch(() => undefined)
    return role
  } finally {
    saving.value = false
  }
}

async function deleteGroupRole(groupId: string, roleId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/groups/${groupId}/roles/${roleId}`, { method: 'DELETE' })
    await loadAuthenticated().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

async function searchUsers(q: string, limit = 20): Promise<UserSearchResponse> {
  return request<UserSearchResponse>('/users/search', { query: { q, limit } })
}

async function getUser(userId: string): Promise<GetUserResponse> {
  return request<GetUserResponse>(`/users/${encodeURIComponent(userId)}`)
}

async function listUsers(opts: { limit?: number; startAfter?: string } = {}): Promise<ListUsersResponse> {
  return request<ListUsersResponse>('/users', {
    query: { limit: opts.limit, start_after: opts.startAfter },
  })
}

async function runSparql(query: string): Promise<SparqlResult> {
  const started = performance.now()
  const result = await request<SparqlResponse>('/metadata/sparql/query', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
  if (result.kind === 'Boolean') {
    return {
      columns: ['value'],
      rows: [{ value: String(result.value) }],
      tookMs: Math.max(1, Math.round(performance.now() - started)),
      totalRows: 1,
    }
  }
  const rows = Array.isArray(result.value) ? result.value : []
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  return {
    columns,
    rows,
    tookMs: Math.max(1, Math.round(performance.now() - started)),
    totalRows: rows.length,
  }
}

async function searchMetadata(
  query: string,
  options: MetadataSearchOptions = {},
): Promise<MetadataSearchResponse> {
  return request<MetadataSearchResponse>('/metadata/search', {
    query: {
      q: query,
      // Backend defaults to 25 and clamps 1..=100; mirror the clamp here.
      limit: Math.min(Math.max(options.limit ?? 25, 1), 100),
      // Query- and filter-bound cursor: the backend rejects a cursor whose
      // fingerprint no longer matches the query or filters with 400. apiRequest
      // drops undefined, so these are absent when the caller omits them.
      cursor: options.cursor,
      group_id: options.group_id,
      conforms_to: options.conforms_to,
    },
    signal: options.signal,
  })
}

async function searchUnified(
  query: string,
  options: UnifiedSearchOptions = {},
): Promise<UnifiedSearchResponse> {
  return request<UnifiedSearchResponse>('/search', {
    query: {
      q: query,
      // A cursor is only accepted with exactly one type (backend contract).
      types: options.types?.length ? options.types.join(',') : undefined,
      limit: options.limit,
      cursor: options.cursor,
      group_id: options.group_id,
      conforms_to: options.conforms_to,
      mode: options.mode,
    },
    signal: options.signal,
  })
}

async function resolveUsers(userIds: string[]): Promise<ResolveUserResult[]> {
  return request<ResolveUserResult[]>('/users/resolve', {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  })
}

function setAuthToken(token: string) {
  const next = token.trim()
  if (next === authToken.value) return
  sessionEpoch++
  authToken.value = next
  storeValue(TOKEN_KEY, authToken.value)
  clearIdentityState()
  loading.value = false
}

function setApiBaseUrl(url: string) {
  const next = url.trim() || defaultApiBaseUrl()
  if (next === apiBaseUrl.value) return
  sessionEpoch++
  apiBaseUrl.value = next
  storeValue(API_BASE_KEY, apiBaseUrl.value === defaultApiBaseUrl() ? '' : apiBaseUrl.value)
  authToken.value = ''
  storeValue(TOKEN_KEY, '')
  clearIdentityState(true)
  loading.value = false
  bootstrapped.value = false
}

const realm = computed<Realm>(() => {
  const id = realmInfo.value?.realm_id ?? nodeInfo.value?.node.realm_id ?? 'unknown'
  const description = realmInfo.value?.description?.trim() ?? ''
  // Derived from the realm description until the backend exposes a short_name.
  const displayName = description || shortId(id)
  return {
    id,
    name: displayName,
    shortName: truncateLabel(displayName),
    color: colorFor(id),
    description,
    established: '',
    homeCountry: '',
    sharedQuotaBytes: 0,
    contact: realmInfo.value?.oidc_providers[0]?.issuer ?? '',
  }
})

const currentUser = computed<User | null>(() => {
  const user = userInfo.value?.user
  if (!user) return null
  return {
    id: user.user_id,
    name: user.name,
    email: user.attributes.email ?? '',
    orcid: user.attributes.orcid,
    affiliation: user.attributes.affiliation ?? '',
    avatarColor: colorFor(user.user_id),
    initials: initials(user.name),
    preferredProfileId: profileIdFromPath(userInfo.value?.preferences.preferred_profile_path ?? undefined),
    favouriteMetadataIds: userInfo.value?.preferences.favourite_metadata_ids ?? [],
  }
})

// The backend authorizes quota edits with WRITE on exactly /{realm_id}/admin/config.
const isRealmAdmin = computed<boolean>(() => {
  const info = userInfo.value
  if (!info) return false
  const target = `/${info.realm.realm_id}/admin/config`
  return info.realm.roles.some((role) =>
    Object.entries(role.permissions).some(([key, value]) => {
      if (value !== 'Write') return false
      if (key === target) return true
      if (!key.endsWith('/**')) return false
      const base = key.slice(0, -3)
      return target === base || target.startsWith(`${base}/`)
    }),
  )
})

// The backend gates the user directory on READ of /{realm_id}/admin/u/**
// (operations list_users / get_user); the seeded realm_admin Write grant on
// /{realm_id}/admin/** covers it.
const canInspectUsers = computed<boolean>(() => {
  const info = userInfo.value
  if (!info) return false
  const target = `/${info.realm.realm_id}/admin/u`
  return info.realm.roles.some((role) =>
    Object.entries(role.permissions).some(([key, value]) => {
      if (value !== 'Read' && value !== 'Write') return false
      if (key === target) return true
      if (!key.endsWith('/**')) return false
      const base = key.slice(0, -3)
      return target === base || target.startsWith(`${base}/`)
    }),
  )
})

// Quota edits are only accepted by a management node; server/local nodes 403.
const isManagementNode = computed<boolean>(() => nodeInfo.value?.node.capabilities === 'management')

const nodes = computed<Node[]>(() => {
  const id = realm.value.id
  return (realmInfo.value?.nodes ?? []).map((node) => ({
    id: node.node_id,
    name: `${node.kind} ${shortId(node.node_id)}`,
    slug: shortId(node.node_id),
    realmId: id,
    region: node.connection_status,
    country: node.kind,
    lat: 0,
    lng: 0,
    endpoint: node.node_id,
    status: node.present ? 'healthy' : 'offline',
    version: '',
    storageUsedBytes: 0,
    storageQuotaBytes: 0,
    objectCount: 0,
    bucketCount: 0,
    metadataCount: metadataItems.value.length,
    peers: [],
    replicaFactor: realmInfo.value?.metadata_replication.default_replication_factor ?? 1,
    established: '',
  }))
})

// Distinct member ids per group, from /groups?include=roles. Only counted
// when the caller can see assigned_users (i.e. is a member of the group).
const groupMemberCounts = computed<Map<string, number>>(() => {
  const counts = new Map<string, number>()
  for (const group of apiGroups.value) {
    const count = memberCount(group.roles)
    if (count !== undefined) counts.set(group.group_id, count)
  }
  return counts
})

// "My groups" come from /users/info; their roles are the caller's own roles.
const myGroups = computed<Group[]>(() =>
  (userInfo.value?.groups ?? []).map((group) =>
    mapGroup({
      group_id: group.group_id,
      display_name: group.display_name,
      realm_id: realm.value.id,
      roles: group.roles,
    }),
  ),
)

// Realm groups the caller is not a member of, from the open GET /groups.
const discoverableGroups = computed<Group[]>(() => {
  const mine = new Set((userInfo.value?.groups ?? []).map((group) => group.group_id))
  return apiGroups.value.filter((group) => !mine.has(group.group_id)).map(mapGroup)
})

const groups = myGroups

function mapGroup(group: ApiGroup): Group {
  return {
    id: group.group_id,
    realmId: group.realm_id,
    name: group.display_name,
    slug: slugify(group.display_name || group.group_id),
    description: roleSummary(group.roles ?? []),
    createdAt: '',
    quotaBytes: 0,
    usedBytes: 0,
    ownerId: '',
    tags: (group.roles ?? []).map((role) => role.name),
    memberCount: groupMemberCounts.value.get(group.group_id),
  }
}

function memberCount(roles?: ApiRole[]): number | undefined {
  if (!roles?.some((role) => role.assigned_users)) return undefined
  const users = new Set<string>()
  for (const role of roles) for (const user of role.assigned_users ?? []) users.add(user)
  return users.size
}

const profiles = computed<MetadataProfile[]>(() => profileItems.value.map(mapProfile))
const metadata = computed<MetadataDoc[]>(() => metadataItems.value.map(mapMetadataDoc))

function mapMetadataDoc(item: MetadataDocumentListItem): MetadataDoc {
  const entity = primaryEntity(item.rocrate_summary)
  const title = textValue(entity?.name) || textValue(entity?.title) || item.document_path || item.document_id
  const description = textValue(entity?.description) || ''
  const keywords = arrayText(entity?.keywords ?? entity?.keyword)
  const license = idValue(entity?.license) || textValue(entity?.license) || ''
  const contributors = people(entity?.author ?? entity?.creator ?? entity?.contributor)
  const profileIds = profileIdsFromConformsTo(entity?.conformsTo)
  const profileId = profileIds[0] ?? ''
  // Keep the raw conformance ids so the UI can show an external profile IRI even when it
  // resolves to no local profile. Drop the RO-Crate spec conformance URI, which is not a profile.
  const conformsToIds = idValues(entity?.conformsTo).filter((id) => !id.startsWith('https://w3id.org/ro/crate'))
  return {
    ulid: item.document_id,
    title,
    description,
    type: arrayText(entity?.['@type']).join(', ') || 'Dataset',
    license,
    keywords,
    currentVersion: 1,
    versions: [
      {
        version: 1,
        versionVector: item.graph_iri,
        createdAt: item.created_at,
        author: contributors[0]?.name ?? '',
        changelog: 'Stored in Aruna.',
        hash: item.document_id,
      },
    ],
    linkedObjects: [],
    primaryBucketId: '',
    realmId: item.group_id,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    author: contributors[0]?.name ?? '',
    organization: contributors[0]?.affiliation ?? '',
    nodeId: '',
    profileId,
    profileIds,
    conformsToIds,
    contributors,
    doi: idValue(entity?.identifier) || textValue(entity?.identifier),
    temporalCoverage: textValue(entity?.temporalCoverage),
    spatialCoverage: textValue(entity?.spatialCoverage),
    language: textValue(entity?.inLanguage),
    roCrate: fullCrates.value[item.document_id] ?? item.rocrate_summary ?? {},
  }
}

function mapProfile(item: MetadataDocumentListItem): MetadataProfile {
  const rocrate = fullCrates.value[item.document_id] ?? item.rocrate_summary
  let parsed: ReturnType<typeof parseProfileCrate>
  try {
    parsed = parseProfileCrate(rocrate)
  } catch {
    // A malformed stored profile crate must never throw the whole `profiles`
    // computed; surface it with no machine-readable rules instead.
    parsed = { name: '', description: '', entityRules: [], datasetPropertyRules: [] }
  }
  const pathId = profileIdFromPath(item.document_path) || item.document_id
  const entity = primaryEntity(rocrate)
  const name = parsed.name || textValue(entity?.name) || pathId
  return {
    id: pathId,
    documentId: item.document_id,
    documentPath: item.document_path,
    graphIri: item.graph_iri,
    profileUri: item.graph_iri,
    name,
    shortName: name.split(/\s+/)[0] || pathId,
    description: parsed.description || textValue(entity?.description) || '',
    domain: typeList(entity).includes('http://www.w3.org/ns/dx/prof#Profile') ? 'RO-Crate Profile' : textValue(entity?.domain) || 'RO-Crate',
    version: parsed.version,
    iconColor: colorFor(pathId),
    entityRules: parsed.entityRules,
    propertyRules: parsed.datasetPropertyRules,
    schema: parsed.schema,
    mode: parsed.mode,
    contextTerms: parsed.contextTerms,
    suggestedKeywords: arrayText(entity?.keywords ?? entity?.keyword),
    managed: item.public,
    usedCount: metadataItems.value.filter((doc) => mapMetadataDoc(doc).profileIds?.includes(pathId)).length,
  }
}

function graph(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return []
  const graphValue = (value as Record<string, unknown>)['@graph']
  return Array.isArray(graphValue) ? graphValue.filter(isRecord) : []
}

function primaryEntity(value: unknown): Record<string, unknown> | undefined {
  const entries = graph(value)
  const descriptor = entries.find((entry) => entry['@id'] === 'ro-crate-metadata.json')
  const rootId = idValue(descriptor?.about)
  return (
    (rootId ? entries.find((entry) => entry['@id'] === rootId) : undefined) ??
    entries.find((entry) => entry['@id'] !== 'ro-crate-metadata.json')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return textValue(value[0])
  if (isRecord(value)) return textValue(value.name ?? value['@id'] ?? value.id)
  return ''
}

function idValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (isRecord(value)) return textValue(value['@id'] ?? value.id)
  return ''
}

function arrayText(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean)
  const single = textValue(value)
  return single ? [single] : []
}

function typeList(entity?: Record<string, unknown>): string[] {
  return arrayText(entity?.['@type'])
}

function people(value: unknown) {
  return arrayText(value).map((name) => ({ name, role: 'Contributor', affiliation: undefined }))
}

function profileIdsFromConformsTo(value: unknown): string[] {
  const resolved = new Set<string>()
  for (const id of idValues(value)) {
    const local = profileIdFromConformanceId(id)
    if (local) resolved.add(local)
  }
  return [...resolved]
}

function profileIdFromConformanceId(id: string): string | undefined {
  const byGraph = profileItems.value.find((profile) => profile.graph_iri === id)
  if (byGraph) return profileIdFromPath(byGraph.document_path) || byGraph.document_id
  return undefined
}

function profileIdFromPath(value?: string | null): string | undefined {
  if (!value) return undefined
  return value.replace(/^profiles\//, '')
}

function idValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(idValues)
  if (isRecord(value)) return idValues(value['@id'] ?? value.id)
  return []
}

// Human-readable tail of an IRI (last path/fragment segment) for chips that surface an
// external profile conformsTo id which does not resolve to a local profile.
export function readableIri(iri: string): string {
  const withoutQuery = iri.split('?')[0].replace(/\/+$/, '')
  return withoutQuery.split(/[/#]/).filter(Boolean).pop() || iri
}

export function colorFor(value: string): string {
  const colors = ['#335DC6', '#24A9E6', '#16a34a', '#0d9488', '#a855f7', '#f97316', '#dc2626']
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return colors[hash % colors.length]
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) : id
}

function truncateLabel(value: string, max = 24): string {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function roleSummary(roles: Array<{ name: string }>): string {
  return roles.length ? `Roles: ${roles.map((role) => role.name).join(', ')}` : ''
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

if (typeof window !== 'undefined') {
  void refresh()
}

export function useAruna() {
  return {
    apiBaseUrl,
    authToken,
    loading,
    saving,
    error,
    authError,
    bootstrapped,
    nodeInfo,
    realmInfo,
    usageInfo,
    userInfo,
    apiGroups,
    credentials,
    realm,
    currentUser,
    isRealmAdmin,
    canInspectUsers,
    isManagementNode,
    nodes,
    groups,
    myGroups,
    discoverableGroups,
    metadata,
    profiles,
    metadataItems,
    profileItems,
    fullCrates,
    cratePending,
    refresh,
    loadInfo,
    loadMetadata,
    loadRoCrate,
    createMetadata,
    getMetadataDocument,
    fetchRoCrateRaw,
    invalidateCrate,
    replaceMetadataRoCrate,
    deleteMetadataDocument,
    listGroupMetadata,
    toggleFavourite,
    updateUserProfile,
    setRealmQuota,
    createGroup,
    getGroup,
    getGroupUsage,
    getGroupUsageHistory,
    createS3Credentials,
    listGroupConnectors,
    getGroupConnector,
    createGroupConnector,
    replaceGroupConnector,
    deleteGroupConnector,
    stageBlob,
    listStagingJobs,
    revokeS3Credential,
    listGroupMembers,
    addGroupMember,
    removeGroupMember,
    leaveGroup,
    createGroupRole,
    deleteGroupRole,
    searchUsers,
    getUser,
    resolveUsers,
    listUsers,
    runSparql,
    searchMetadata,
    searchUnified,
    setAuthToken,
    setApiBaseUrl,
  }
}
