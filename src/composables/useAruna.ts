import { computed, ref } from 'vue'
import type { Group, MetadataDoc, MetadataProfile, Node, Realm, SparqlResult, User } from '@/data/types'
import {
  ApiError,
  apiRequest,
  defaultApiBaseUrl,
  type AddGroupMemberRequest,
  type ApiGroup,
  type ApiRole,
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
  type MetadataRoCrateResponse,
  type MetadataSearchResponse,
  type RealmInfoResponse,
  type RealmQuotaConfig,
  type S3CredentialSummary,
  type SparqlResponse,
  type UsageResponse,
  type UserInfoResponse,
  type UserSearchResponse,
} from '@/lib/api'
import { parseProfileCrate, resolveProfileArtifacts } from '@/lib/profiles/rocrate'

const TOKEN_KEY = 'aruna.authToken'
const API_BASE_KEY = 'aruna.apiBaseUrl'

const apiBaseUrl = ref(readStored(API_BASE_KEY) || defaultApiBaseUrl())
const authToken = ref(readStored(TOKEN_KEY) || import.meta.env.VITE_ARUNA_TOKEN || '')
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

function readStored(key: string): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(key) ?? ''
}

function storeValue(key: string, value: string) {
  if (typeof window === 'undefined') return
  if (value) window.localStorage.setItem(key, value)
  else window.localStorage.removeItem(key)
}

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

async function request<T>(path: string, options = {}) {
  return apiRequest<T>(path, options, client())
}

async function refresh() {
  loading.value = true
  error.value = null
  authError.value = null
  try {
    await Promise.all([loadInfo(), loadMetadata()])
    if (authToken.value) {
      await loadAuthenticated().catch((err: unknown) => {
        authError.value = errorMessage(err)
        userInfo.value = null
        apiGroups.value = []
        credentials.value = []
      })
    } else {
      userInfo.value = null
      apiGroups.value = []
      credentials.value = []
    }
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
    bootstrapped.value = true
  }
}

async function loadInfo() {
  // /info/usage is not deployed everywhere yet; hide the stats on failure.
  const [info, realm, usage] = await Promise.all([
    request<InfoResponse>('/info'),
    request<RealmInfoResponse>('/info/realm'),
    request<UsageResponse>('/info/usage').catch(() => null),
  ])
  nodeInfo.value = info
  realmInfo.value = realm
  usageInfo.value = usage
}

// Right after a create, the RO-Crate graph projection can lag behind the
// document registry, so listing with include=summary briefly 500s. Retry a
// few times, then fall back to a summary-less list so the catalog still loads.
async function listMetadata(query: Record<string, string | number>): Promise<ListMetadataResponse> {
  const attempts = 3
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await request<ListMetadataResponse>('/metadata', {
        query: { include: 'summary', limit: 1000, ...query },
      })
    } catch (err) {
      const transient = err instanceof ApiError && err.status >= 500
      if (transient && attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        continue
      }
      if (transient) {
        return request<ListMetadataResponse>('/metadata', { query: { limit: 1000, ...query } })
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

async function loadMetadata() {
  const [metadata, profiles] = await Promise.all([
    listMetadata({}),
    listMetadata({ path_prefix: 'profiles/' }),
  ])
  metadataItems.value = metadata.documents.filter((doc) => !doc.document_path.startsWith('profiles/'))
  profileItems.value = profiles.documents
}

async function loadAuthenticated() {
  const [me, groups, credentialList] = await Promise.all([
    request<UserInfoResponse>('/users/info'),
    request<ListGroupsResponse>('/groups', { query: { include: 'roles', limit: 1000 } }),
    request<ListS3CredentialsResponse>('/users/credentials'),
  ])
  userInfo.value = me
  apiGroups.value = groups.groups
  credentials.value = credentialList.credentials
}

// Thrown when the RO-Crate graph projection is still materializing after the
// polling window. This is a transient state, not a failure.
export class CrateNotReadyError extends Error {
  constructor(public documentId: string) {
    super('The RO-Crate is still being prepared. Try again in a moment.')
    this.name = 'CrateNotReadyError'
  }
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
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await request<MetadataRoCrateResponse>(`/metadata/${documentId}/rocrate`)
        // Public profile crates reference their artifacts on S3 instead of
        // embedding text; fetch that content once here so the synchronous
        // consumers (mapProfile, the dataset dialog) keep reading `text`.
        // Crates without external artifacts pass through untouched.
        const resolved = await resolveProfileArtifacts(response.rocrate)
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
    setCratePending(documentId, false)
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

async function searchMetadata(query: string) {
  return request<MetadataSearchResponse>('/metadata/search', {
    query: { q: query, limit: 100 },
  })
}

function setAuthToken(token: string) {
  authToken.value = token.trim()
  storeValue(TOKEN_KEY, authToken.value)
}

function setApiBaseUrl(url: string) {
  apiBaseUrl.value = url.trim() || defaultApiBaseUrl()
  storeValue(API_BASE_KEY, apiBaseUrl.value === defaultApiBaseUrl() ? '' : apiBaseUrl.value)
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
  return graph(value).find((entry) => entry['@id'] !== 'ro-crate-metadata.json')
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

function colorFor(value: string): string {
  const colors = ['#335DC6', '#24A9E6', '#16a34a', '#0d9488', '#a855f7', '#f97316', '#dc2626']
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return colors[hash % colors.length]
}

function initials(name: string): string {
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
    credentials,
    realm,
    currentUser,
    isRealmAdmin,
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
    loadRoCrate,
    createMetadata,
    updateUserProfile,
    setRealmQuota,
    createGroup,
    getGroup,
    createS3Credentials,
    revokeS3Credential,
    listGroupMembers,
    addGroupMember,
    removeGroupMember,
    leaveGroup,
    createGroupRole,
    deleteGroupRole,
    searchUsers,
    runSparql,
    searchMetadata,
    setAuthToken,
    setApiBaseUrl,
  }
}
