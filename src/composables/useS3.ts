import { computed, ref, shallowRef, watch } from 'vue'
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  type CORSRule,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  apiRequest,
  type CreateS3SessionRequest,
  type S3SessionResponse,
  type S3SessionRestriction,
} from '@/lib/api'
import { drsDownloadHref, isDrsReference, parseS3Url } from '@/lib/tes'
import { useAruna } from './useAruna'

export interface S3Key {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}

export type S3SessionState = 'active' | 'refreshing' | 'warning' | 'expired'

export interface PortalS3Session extends S3Key {
  sessionId: string
  userId: string
  groupId: string
  issuerNodeId: string
  s3Endpoint: string
  apiBase: string
  expiresAt: number
  restrictions: S3SessionRestriction[]
  state: S3SessionState
  warning: string | null
  lastUsedAt: number | null
}

export interface S3ActiveContext {
  nodeId: string
  userId: string
  groupId: string
  session: PortalS3Session
}

export interface S3SessionReference {
  nodeId: string
  groupId: string
  accessKeyId: string
}

export interface BucketEntry {
  name: string
  createdAt?: Date
}

export interface ObjectEntry {
  key: string
  name: string
  size?: number
  lastModified?: Date
  etag?: string
}

export interface FolderEntry {
  prefix: string
  name: string
}

export interface ObjectPage {
  objects: ObjectEntry[]
  folders: FolderEntry[]
  nextToken?: string
}

export interface ObjectHead {
  size?: number
  contentType?: string
  etag?: string
  lastModified?: Date
  /** User metadata; the SDK strips the x-amz-meta- prefix from the keys. */
  metadata: Record<string, string>
}

const { nodeInfo, realmInfo, authToken, apiBaseUrl, currentUser } = useAruna()

const STORAGE_KEY = 'aruna.s3Key'

export const S3_SESSION_REFRESH_WINDOW_MS = 5 * 60 * 1000
const S3_SESSION_REFRESH_JITTER_MAX_MS = 5_000

/** One-time migration only. Portal S3 sessions are never written to storage. */
export function purgeLegacyS3KeyStorage(): void {
  if (typeof window === 'undefined') return
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage.removeItem(STORAGE_KEY)
    } catch {
      // Continue with the other storage and the in-memory session layer.
    }
  }
}

purgeLegacyS3KeyStorage()

const connectedEndpoint = computed(
  () =>
    nodeInfo.value?.services?.interfaces?.s3?.url ??
    realmInfo.value?.interfaces?.s3?.url ??
    null,
)

const sessions = shallowRef(new Map<string, PortalS3Session>())
const sessionRevision = ref(0)
const activeSessionKey = ref<string | null>(null)
const pendingMints = new Map<string, Promise<PortalS3Session>>()
const clientCache = new Map<
  string,
  { storeKey: string; accessKeyId: string; client: S3Client }
>()
let boundaryGeneration = 0
let activationGeneration = 0
let refreshTimer: ReturnType<typeof globalThis.setTimeout> | undefined
let expiryTimer: ReturnType<typeof globalThis.setTimeout> | undefined

function storeKey(nodeId: string, groupId: string): string {
  return `${nodeId}\u0000${groupId}`
}

function localNodeId(): string | null {
  return nodeInfo.value?.node.peer_id ?? null
}

function normalizeNodeId(nodeId?: string | null): string | null {
  if (nodeId === undefined) {
    return activeSession.value?.issuerNodeId ?? localNodeId()
  }
  if (!nodeId || nodeId === localNodeId()) return localNodeId()
  return nodeId
}

function nodeApiBase(nodeId: string): string | null {
  if (nodeId === localNodeId()) return apiBaseUrl.value
  const node = (realmInfo.value?.nodes ?? []).find((entry) => entry.node_id === nodeId)
  const url = (node?.info?.urls?.api ?? node?.rest_url ?? '').replace(/\/+$/, '')
  if (!url) return null
  return url.endsWith('/api/v1') ? url : `${url}/api/v1`
}

function putSession(key: string, session: PortalS3Session): void {
  const previous = sessions.value.get(key)
  if (previous && previous.accessKeyId !== session.accessKeyId) {
    for (const [cacheKey, cached] of clientCache) {
      if (cached.storeKey !== key) continue
      cached.client.destroy()
      clientCache.delete(cacheKey)
    }
  }
  const next = new Map(sessions.value)
  next.set(key, session)
  sessions.value = next
  sessionRevision.value++
}

function sessionUsable(session: PortalS3Session | null | undefined, now = Date.now()): session is PortalS3Session {
  return Boolean(session && session.state !== 'expired' && session.expiresAt > now)
}

const activeSession = computed(() =>
  activeSessionKey.value ? (sessions.value.get(activeSessionKey.value) ?? null) : null,
)

const activeContext = computed<S3ActiveContext | null>(() => {
  const session = activeSession.value
  return session
    ? {
        nodeId: session.issuerNodeId,
        userId: session.userId,
        groupId: session.groupId,
        session,
      }
    : null
})

const activeKey = computed<S3Key | null>(() => {
  const session = activeSession.value
  return sessionUsable(session)
    ? {
        accessKeyId: session.accessKeyId,
        secretAccessKey: session.secretAccessKey,
        sessionToken: session.sessionToken,
      }
    : null
})

const hasActiveKey = computed(() => activeKey.value !== null)
const endpoint = computed(() => activeSession.value?.s3Endpoint ?? connectedEndpoint.value)

// Resolves the S3 endpoint serving `nodeId`; null/the local peer id map to the
// connected node. Resolution never changes the active session.
function endpointForNode(nodeId?: string | null): string | null {
  if (!nodeId || nodeId === localNodeId()) return connectedEndpoint.value
  const node = (realmInfo.value?.nodes ?? []).find((entry) => entry.node_id === nodeId)
  return node?.info?.urls?.s3 ?? null
}

export function s3SessionRefreshJitterMs(accessKeyId: string): number {
  let hash = 0
  for (const char of accessKeyId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % (S3_SESSION_REFRESH_JITTER_MAX_MS + 1)
}

function clearTimers(): void {
  if (refreshTimer !== undefined) globalThis.clearTimeout(refreshTimer)
  if (expiryTimer !== undefined) globalThis.clearTimeout(expiryTimer)
  refreshTimer = undefined
  expiryTimer = undefined
}

function expireSession(key: string): void {
  const session = sessions.value.get(key)
  if (!session || session.state === 'expired') return
  putSession(key, {
    ...session,
    state: 'expired',
    warning: 'This S3 session has expired. Open the node and group again to continue.',
  })
  if (activeSessionKey.value === key) clearTimers()
}

function scheduleActiveSession(): void {
  clearTimers()
  const key = activeSessionKey.value
  if (!key) return
  const session = sessions.value.get(key)
  if (!sessionUsable(session)) {
    if (session) expireSession(key)
    return
  }
  expiryTimer = globalThis.setTimeout(
    () => expireSession(key),
    Math.max(0, session.expiresAt - Date.now()),
  )
  // A failed refresh is not retried automatically. The still-valid session can
  // finish known work, but no request with an unknown outcome is replayed.
  if (session.lastUsedAt === null || session.state === 'warning') return
  const refreshAt =
    session.expiresAt - S3_SESSION_REFRESH_WINDOW_MS + s3SessionRefreshJitterMs(session.accessKeyId)
  const delay = Math.max(0, refreshAt - Date.now())
  refreshTimer = globalThis.setTimeout(() => void refreshSession(key), delay)
}

function responseSession(
  response: S3SessionResponse,
  expected: { nodeId: string; groupId: string; userId: string; apiBase: string; previous?: PortalS3Session },
): PortalS3Session {
  if (response.group.id !== expected.groupId) {
    throw new Error(`The session response named group ${response.group.id}, expected ${expected.groupId}.`)
  }
  if (response.issuer_node.node_id !== expected.nodeId) {
    throw new Error(`The session was issued by node ${response.issuer_node.node_id}, expected ${expected.nodeId}.`)
  }
  if (expected.previous && response.access_key_id !== expected.previous.accessKeyId) {
    throw new Error('The refreshed session changed its access key ID.')
  }
  const expiresAt = Date.parse(response.expires_at)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('The node returned an expired S3 session.')
  }
  const s3Endpoint = response.issuer_node.s3_endpoint ?? endpointForNode(expected.nodeId)
  if (!s3Endpoint) throw new Error(`Node ${expected.nodeId} does not publish an S3 endpoint.`)
  return {
    sessionId: response.access_key_id,
    accessKeyId: response.access_key_id,
    secretAccessKey: response.secret_access_key,
    sessionToken: response.session_token,
    userId: expected.userId,
    groupId: expected.groupId,
    issuerNodeId: expected.nodeId,
    s3Endpoint,
    apiBase: expected.apiBase,
    expiresAt,
    restrictions: response.restrictions,
    state: 'active',
    warning: null,
    // Refresh resets the backend activity marker. The next signed S3 request
    // marks this cycle active and arms its next refresh.
    lastUsedAt: null,
  }
}

async function mintSession(nodeId: string, groupId: string, userId: string): Promise<PortalS3Session> {
  const key = storeKey(nodeId, groupId)
  const pending = pendingMints.get(key)
  if (pending) return pending
  const apiBase = nodeApiBase(nodeId)
  if (!apiBase) throw new Error(`Node ${nodeId} does not publish an API endpoint.`)
  const generation = boundaryGeneration
  const request = (async () => {
    const body: CreateS3SessionRequest = { group_id: groupId }
    const response = await apiRequest<S3SessionResponse>(
      '/users/s3-sessions',
      { method: 'POST', body: JSON.stringify(body) },
      { baseUrl: apiBase, token: authToken.value },
    )
    if (
      generation !== boundaryGeneration ||
      apiBaseUrl.value !== sessionsBoundaryApiBase ||
      knownUserId !== userId
    ) {
      throw new DOMException('The authenticated API context changed.', 'AbortError')
    }
    const session = responseSession(response, { nodeId, groupId, userId, apiBase })
    putSession(key, session)
    return session
  })()
  pendingMints.set(key, request)
  try {
    return await request
  } finally {
    if (pendingMints.get(key) === request) pendingMints.delete(key)
  }
}

async function refreshSession(key: string): Promise<void> {
  const session = sessions.value.get(key)
  if (!sessionUsable(session) || activeSessionKey.value !== key) return
  putSession(key, { ...session, state: 'refreshing', warning: null })
  try {
    const response = await apiRequest<S3SessionResponse>(
      `/users/s3-sessions/${encodeURIComponent(session.accessKeyId)}/refresh`,
      { method: 'POST' },
      { baseUrl: session.apiBase, token: authToken.value },
    )
    const current = sessions.value.get(key)
    if (!current || current.accessKeyId !== session.accessKeyId) return
    putSession(
      key,
      responseSession(response, {
        nodeId: session.issuerNodeId,
        groupId: session.groupId,
        userId: session.userId,
        apiBase: session.apiBase,
        previous: session,
      }),
    )
  } catch (error) {
    const current = sessions.value.get(key)
    if (!current || current.accessKeyId !== session.accessKeyId) return
    if (current.expiresAt <= Date.now()) {
      expireSession(key)
      return
    }
    putSession(key, {
      ...current,
      state: 'warning',
      warning: `Session refresh failed. The current session remains valid until ${new Date(current.expiresAt).toLocaleTimeString()}: ${s3ErrorMessage(error)}`,
    })
  } finally {
    if (activeSessionKey.value === key) scheduleActiveSession()
  }
}

function markSessionUsed(key: string): void {
  const session = sessions.value.get(key)
  if (!sessionUsable(session)) return
  putSession(key, { ...session, lastUsedAt: Date.now() })
  if (activeSessionKey.value === key) scheduleActiveSession()
}

async function activateContext(nodeId: string | null, groupId: string): Promise<PortalS3Session> {
  const explicitGroupId = groupId.trim()
  if (!explicitGroupId) throw new Error('Select a group before opening S3 storage.')
  const user = currentUser.value
  if (!user || !authToken.value) throw new Error('Sign in before opening S3 storage.')
  const issuerNodeId = normalizeNodeId(nodeId)
  if (!issuerNodeId) throw new Error('The selected node identity is not available yet.')
  const activation = ++activationGeneration
  const key = storeKey(issuerNodeId, explicitGroupId)
  const existing = sessions.value.get(key)
  const session = sessionUsable(existing)
    ? existing
    : await mintSession(issuerNodeId, explicitGroupId, user.id)
  if (activation !== activationGeneration) return session
  if (currentUser.value?.id !== session.userId || apiBaseUrl.value !== sessionsBoundaryApiBase) {
    throw new DOMException('The authenticated API context changed.', 'AbortError')
  }
  activeSessionKey.value = key
  scheduleActiveSession()
  return session
}

function destroyClients(): void {
  for (const cached of clientCache.values()) cached.client.destroy()
  clientCache.clear()
}

function clearSessions(): void {
  boundaryGeneration++
  activationGeneration++
  pendingMints.clear()
  activeSessionKey.value = null
  clearTimers()
  destroyClients()
  sessions.value = new Map()
  sessionRevision.value++
}

let knownUserId = currentUser.value?.id ?? null
let sessionsBoundaryApiBase = apiBaseUrl.value

watch(apiBaseUrl, (base) => {
  if (base === sessionsBoundaryApiBase) return
  sessionsBoundaryApiBase = base
  knownUserId = currentUser.value?.id ?? null
  clearSessions()
})

watch([authToken, currentUser], ([token, user]) => {
  if (!token) {
    knownUserId = null
    if (sessions.value.size) clearSessions()
    return
  }
  // useAruna temporarily clears currentUser while a replacement token is
  // validated. Keep sessions until the resolved identity proves it changed.
  if (!user) return
  if (knownUserId && knownUserId !== user.id) clearSessions()
  knownUserId = user.id
})

// Maps a path-style object URL (as stored in profile-crate `contentUrl`s) back to
// the bucket/key/node an authenticated GetObject needs. Tries the connected
// node's endpoint first, then every realm node's published S3 endpoint, so a
// crate published on a remote node still resolves. Returns null for hosts that
// belong to no known node, the genuinely external URLs a browser must fetch
// directly.
function resolveObjectUrl(url: string): { bucket: string; key: string; nodeId: string | null } | null {
  const local = parseS3Url(url, connectedEndpoint.value)
  if (local) return { ...local, nodeId: null }
  for (const node of realmInfo.value?.nodes ?? []) {
    const nodeEndpoint = node.info?.urls?.s3
    if (!nodeEndpoint) continue
    const parsed = parseS3Url(url, nodeEndpoint)
    if (parsed) return { ...parsed, nodeId: node.node_id }
  }
  return null
}

export class S3ContextMismatchError extends Error {
  constructor(
    public issuerNodeId: string,
    public requiredNodeId: string,
  ) {
    super(`Session issuer ${issuerNodeId} cannot access node ${requiredNodeId}. Open the group on node ${requiredNodeId} first.`)
    this.name = 'S3ContextMismatchError'
  }
}

export class S3SessionUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'S3SessionUnavailableError'
  }
}

function sessionForReference(reference: S3SessionReference): PortalS3Session | null {
  const session = sessions.value.get(storeKey(reference.nodeId, reference.groupId)) ?? null
  if (!session || session.accessKeyId !== reference.accessKeyId) return null
  if (!sessionUsable(session)) {
    expireSession(storeKey(reference.nodeId, reference.groupId))
    return null
  }
  return session
}

function referenceForContext(nodeId: string | null, groupId: string): S3SessionReference | null {
  const issuerNodeId = normalizeNodeId(nodeId)
  if (!issuerNodeId) return null
  const session = sessions.value.get(storeKey(issuerNodeId, groupId))
  return sessionUsable(session)
    ? { nodeId: issuerNodeId, groupId, accessKeyId: session.accessKeyId }
    : null
}

function client(nodeId?: string | null, reference?: S3SessionReference): S3Client {
  const session = reference ? sessionForReference(reference) : activeSession.value
  if (!sessionUsable(session)) {
    throw new S3SessionUnavailableError('No valid S3 session is available for this node and group.')
  }
  if (currentUser.value?.id !== session.userId) {
    throw new S3SessionUnavailableError('The S3 session belongs to a different authenticated user.')
  }
  const requiredNodeId = nodeId === undefined ? session.issuerNodeId : normalizeNodeId(nodeId)
  if (!requiredNodeId) throw new S3SessionUnavailableError('The required node identity is not available.')
  if (requiredNodeId !== session.issuerNodeId) {
    throw new S3ContextMismatchError(session.issuerNodeId, requiredNodeId)
  }
  const key = storeKey(session.issuerNodeId, session.groupId)
  const cacheKey = `${session.s3Endpoint}\u0000${key}\u0000${session.accessKeyId}`
  const cached = clientCache.get(cacheKey)
  if (cached) return cached.client
  const created = new S3Client({
    endpoint: session.s3Endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: async () => {
      const current = sessions.value.get(key)
      if (!sessionUsable(current) || current.accessKeyId !== session.accessKeyId) {
        throw new S3SessionUnavailableError('The S3 session expired before this request could start.')
      }
      markSessionUsed(key)
      return {
        accessKeyId: current.accessKeyId,
        secretAccessKey: current.secretAccessKey,
        sessionToken: current.sessionToken,
      }
    },
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  clientCache.set(cacheKey, { storeKey: key, accessKeyId: session.accessKeyId, client: created })
  return created
}

function permissionPatternMatches(pattern: string, path: string): boolean {
  if (pattern === path) return true
  if (!pattern.endsWith('/**')) return false
  const root = pattern.slice(0, -3)
  return path === root || path.startsWith(`${root}/`)
}

export function s3RestrictionsAllowPath(
  restrictions: readonly S3SessionRestriction[],
  path: string,
  required: 'read' | 'write',
): boolean {
  if (!restrictions.length) return true
  let allowed = false
  for (const restriction of restrictions) {
    if (!permissionPatternMatches(restriction.pattern, path)) continue
    const permission = restriction.permission.toLowerCase()
    if (permission === 'deny') return false
    if (permission === 'write' || (permission === 'read' && required === 'read')) allowed = true
  }
  return allowed
}

function permissionPath(session: PortalS3Session, bucket: string, key?: string): string | null {
  const realmId = realmInfo.value?.realm_id ?? nodeInfo.value?.node.realm_id
  if (!realmId) return null
  const bucketPath = `/${realmId}/g/${session.groupId}/data/${session.issuerNodeId}/${bucket}`
  return key === undefined || key === '' ? bucketPath : `${bucketPath}/${key}`
}

function sessionForNode(nodeId?: string | null): PortalS3Session | null {
  const session = activeSession.value
  if (!sessionUsable(session)) return null
  const requiredNodeId = nodeId === undefined ? session.issuerNodeId : normalizeNodeId(nodeId)
  return requiredNodeId === session.issuerNodeId ? session : null
}

function canAccess(
  required: 'read' | 'write',
  bucket: string,
  key?: string,
  nodeId?: string | null,
): boolean {
  const session = sessionForNode(nodeId)
  if (!session) return false
  const path = permissionPath(session, bucket, key)
  return path ? s3RestrictionsAllowPath(session.restrictions, path, required) : false
}

function restrictionScope(pattern: string): { root: string; recursive: boolean } {
  return pattern.endsWith('/**')
    ? { root: pattern.slice(0, -3), recursive: true }
    : { root: pattern, recursive: false }
}

function canWritePrefix(bucket: string, prefix: string, nodeId?: string | null): boolean {
  const session = sessionForNode(nodeId)
  if (!session) return false
  if (!session.restrictions.length) return true
  const path = permissionPath(session, bucket, prefix.replace(/\/$/, ''))
  if (!path) return false
  return session.restrictions.some((restriction) => {
    if (restriction.permission.toLowerCase() !== 'write') return false
    const scope = restrictionScope(restriction.pattern)
    let candidate: string | null = null
    if (!scope.recursive) {
      if (scope.root === path || scope.root.startsWith(`${path}/`)) candidate = scope.root
    } else if (path === scope.root || path.startsWith(`${scope.root}/`)) {
      candidate = path
    } else if (scope.root.startsWith(`${path}/`)) {
      candidate = scope.root
    }
    return candidate ? s3RestrictionsAllowPath(session.restrictions, candidate, 'write') : false
  })
}

function restrictionIntersectsTree(pattern: string, path: string): boolean {
  const scope = restrictionScope(pattern)
  if (!scope.recursive) return scope.root === path || scope.root.startsWith(`${path}/`)
  return path === scope.root || path.startsWith(`${scope.root}/`) || scope.root.startsWith(`${path}/`)
}

function canDeletePrefix(bucket: string, prefix: string, nodeId?: string | null): boolean {
  const session = sessionForNode(nodeId)
  if (!session) return false
  if (!session.restrictions.length) return true
  const normalizedPrefix = prefix.replace(/\/$/, '')
  const path = permissionPath(session, bucket, normalizedPrefix)
  if (!path) return false
  const coversTree = session.restrictions.some((restriction) => {
    if (restriction.permission.toLowerCase() !== 'write' || !restriction.pattern.endsWith('/**')) {
      return false
    }
    const root = restriction.pattern.slice(0, -3)
    return path === root || path.startsWith(`${root}/`)
  })
  if (!coversTree) return false
  return !session.restrictions.some(
    (restriction) =>
      restriction.permission.toLowerCase() === 'deny' &&
      restrictionIntersectsTree(restriction.pattern, path),
  )
}

function contextMismatch(nodeId: string | null): { issuerNodeId: string; requiredNodeId: string } | null {
  const session = activeSession.value
  const requiredNodeId = normalizeNodeId(nodeId)
  if (!session || !requiredNodeId || session.issuerNodeId === requiredNodeId) return null
  return { issuerNodeId: session.issuerNodeId, requiredNodeId }
}

function sessionState(reference: S3SessionReference): 'usable' | 'expired' | 'missing' {
  const session = sessions.value.get(storeKey(reference.nodeId, reference.groupId))
  if (!session || session.accessKeyId !== reference.accessKeyId) return 'missing'
  if (!sessionUsable(session)) {
    expireSession(storeKey(reference.nodeId, reference.groupId))
    return 'expired'
  }
  return 'usable'
}

async function listBuckets(): Promise<BucketEntry[]> {
  const response = await client().send(new ListBucketsCommand({}))
  return (response.Buckets ?? [])
    .filter((bucket) => bucket.Name)
    .map((bucket) => ({ name: bucket.Name as string, createdAt: bucket.CreationDate }))
}

async function createBucket(name: string): Promise<void> {
  await client().send(new CreateBucketCommand({ Bucket: name }))
}

// The portal's own public-read rule is tagged by ID so re-publishing swaps it
// idempotently without disturbing rules other tools stored on the bucket.
const PORTAL_CORS_RULE_ID = 'aruna-portal-public-read'

// Read-only CORS for publicly served artifacts: browsers (other portals,
// Crate-O, …) must be able to fetch objects from this bucket cross-origin.
// PutBucketCors REPLACES the bucket's whole config, and a publish destination
// may be an ordinary data bucket, so the existing rules are read first and
// preserved; only the portal's own rule (or its untagged legacy shape) is
// replaced.
async function allowPublicReadCors(bucket: string): Promise<void> {
  const kept = (await currentCorsRules(bucket)).filter(
    (rule) => rule.ID !== PORTAL_CORS_RULE_ID && !isLegacyPortalCorsRule(rule),
  )
  await client().send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          ...kept,
          {
            ID: PORTAL_CORS_RULE_ID,
            // PUT is required: the publish flow itself uploads the artifacts
            // from the browser right after applying this rule - GET/HEAD-only
            // made those PUTs fail their own preflight. CORS is not access
            // control: writes still need valid signatures; anonymous access
            // stays read-only via the Everyone-principal role.
            AllowedMethods: ['GET', 'HEAD', 'PUT'],
            AllowedOrigins: ['*'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  )
}

async function currentCorsRules(bucket: string): Promise<CORSRule[]> {
  try {
    const response = await client().send(new GetBucketCorsCommand({ Bucket: bucket }))
    return response.CORSRules ?? []
  } catch (err) {
    // A fresh bucket has no stored configuration yet.
    if ((err as { name?: string }).name === 'NoSuchCORSConfiguration') return []
    throw err
  }
}

// The exact rules older portal versions wrote without an ID tag; they are
// replaced like the tagged rule, or every publish would stack another copy.
function isLegacyPortalCorsRule(rule: CORSRule): boolean {
  if (rule.ID) return false
  const methods = [...(rule.AllowedMethods ?? [])].sort().join(',')
  return (
    (methods === 'GET,HEAD' || methods === 'GET,HEAD,PUT') &&
    (rule.AllowedOrigins ?? []).join(',') === '*' &&
    (rule.AllowedHeaders ?? []).join(',') === '*'
  )
}

// Small generated artifacts (profile mode/schema/html) — a single PutObject,
// no multipart machinery.
async function putTextObject(bucket: string, key: string, text: string, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new TextEncoder().encode(text),
      ContentType: contentType,
    }),
  )
}

async function listObjects(
  bucket: string,
  prefix: string,
  token?: string,
  nodeId?: string | null,
): Promise<ObjectPage> {
  const response = await client(nodeId).send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      Delimiter: '/',
      ContinuationToken: token,
      MaxKeys: 200,
    }),
  )
  const folders = (response.CommonPrefixes ?? [])
    .filter((entry) => entry.Prefix)
    .map((entry) => {
      const full = entry.Prefix as string
      return { prefix: full, name: full.slice(prefix.length).replace(/\/$/, '') }
    })
  const objects = (response.Contents ?? [])
    .filter((entry) => entry.Key && entry.Key !== prefix)
    .map((entry) => ({
      key: entry.Key as string,
      name: (entry.Key as string).slice(prefix.length),
      size: entry.Size,
      lastModified: entry.LastModified,
      etag: entry.ETag?.replaceAll('"', ''),
    }))
  return {
    objects,
    folders,
    nextToken: response.IsTruncated ? response.NextContinuationToken : undefined,
  }
}

// Flat (no-delimiter) walk of everything under a prefix, for folder-level
// staging. Returns at most `max` objects plus a truncation marker so callers
// can refuse oversized folders instead of silently dropping files.
async function listObjectsRecursive(
  bucket: string,
  prefix: string,
  max: number,
  nodeId?: string | null,
): Promise<{ objects: ObjectEntry[]; truncated: boolean }> {
  const objects: ObjectEntry[] = []
  let token: string | undefined
  for (;;) {
    const response = await client(nodeId).send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
        MaxKeys: Math.min(1000, max + 1 - objects.length),
      }),
    )
    for (const entry of response.Contents ?? []) {
      // Zero-byte folder markers are plumbing, not stageable files.
      if (!entry.Key || entry.Key.endsWith('/')) continue
      if (objects.length === max) return { objects, truncated: true }
      objects.push({
        key: entry.Key,
        name: entry.Key.slice(prefix.length),
        size: entry.Size,
        lastModified: entry.LastModified,
        etag: entry.ETag?.replaceAll('"', ''),
      })
    }
    if (!response.IsTruncated || !response.NextContinuationToken) return { objects, truncated: false }
    token = response.NextContinuationToken
  }
}

export interface UploadHandle {
  promise: Promise<void>
  abort: () => Promise<void>
}

// Files larger than one part are uploaded via S3 multipart with parallel
// parts; abort() tells the node to drop the parts already written.
const UPLOAD_PART_SIZE = 16 * 1024 * 1024
const UPLOAD_CONCURRENCY = 3

function uploadObject(
  bucket: string,
  key: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  nodeId?: string | null,
  sessionReference?: S3SessionReference,
): UploadHandle {
  const upload = new Upload({
    client: client(nodeId, sessionReference),
    params: {
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: file.type || 'application/octet-stream',
    },
    partSize: UPLOAD_PART_SIZE,
    queueSize: UPLOAD_CONCURRENCY,
    leavePartsOnError: false,
  })
  if (onProgress) {
    upload.on('httpUploadProgress', (progress) => {
      onProgress(progress.loaded ?? 0, progress.total ?? file.size)
    })
  }
  return {
    promise: upload.done().then(() => undefined),
    abort: () => upload.abort(),
  }
}

// S3 folder convention: a zero-byte object whose key ends in '/'.
async function createFolder(
  bucket: string,
  prefix: string,
  name: string,
  nodeId?: string | null,
): Promise<void> {
  await client(nodeId).send(
    new PutObjectCommand({ Bucket: bucket, Key: `${prefix}${name}/`, Body: new Uint8Array(0) }),
  )
}

async function deleteObject(bucket: string, key: string, nodeId?: string | null): Promise<void> {
  await client(nodeId).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export interface DeletePrefixResult {
  deleted: number
  errors: { key: string; message: string }[]
}

// Applies version-less deletes to every current key under `prefix`, including
// the zero-byte "folder/" marker that listObjectsRecursive deliberately skips,
// in DeleteObjects batches of up to 1000 keys. In a versioned bucket this
// creates delete markers and preserves historical versions. Per-key failures
// are collected instead of aborting the walk so one locked object does not
// strand the rest.
async function deletePrefix(
  bucket: string,
  prefix: string,
  nodeId?: string | null,
): Promise<DeletePrefixResult> {
  const s3 = client(nodeId)
  let deleted = 0
  const errors: DeletePrefixResult['errors'] = []
  // The zero-byte "folder/" marker object is deleted explicitly even when the
  // listing never returns it (some stores fold it into CommonPrefixes only).
  // Only trailing-slash prefixes have a marker; a bare prefix must never make
  // us delete a real object that merely shares the name.
  const markerKey = prefix.endsWith('/') ? prefix : null
  let markerBatched = false

  const deleteBatch = async (keys: string[]) => {
    const response = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: false },
      }),
    )
    const failed = response.Errors ?? []
    deleted += keys.length - failed.length
    for (const failure of failed) {
      // The marker often does not exist as a real object; a failed delete for
      // that specific key must not fail the whole folder delete.
      if (markerKey && failure.Key === markerKey && failure.Code !== 'PurgeInProgress') continue
      errors.push({
        key: failure.Key ?? '(unknown key)',
        message:
          failure.Code === 'PurgeInProgress'
            ? PURGE_IN_PROGRESS_MESSAGE
            : failure.Message ?? failure.Code ?? 'delete failed',
      })
    }
  }

  let token: string | undefined
  for (;;) {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    )
    const keys = new Set(
      (page.Contents ?? [])
        .map((entry) => entry.Key)
        .filter((key): key is string => Boolean(key)),
    )
    const lastPage = !page.IsTruncated || !page.NextContinuationToken
    if (markerKey && !markerBatched && (keys.has(markerKey) || lastPage)) {
      keys.add(markerKey)
      markerBatched = true
    }
    if (keys.size) await deleteBatch([...keys])
    if (lastPage) break
    token = page.NextContinuationToken
  }

  return { deleted, errors }
}

// Removes the bucket itself. S3 only drops an EMPTY bucket, so callers empty it
// first (deletePrefix with a bare '' prefix walks and batch-deletes every key).
// A versioning-enabled store keeps noncurrent versions and delete markers after
// that purge and rejects this call with "BucketNotEmpty", surfaced distinctly
// via isS3BucketNotEmptyError so the UI can explain the leftover versions.
async function deleteBucket(bucket: string, nodeId?: string | null): Promise<void> {
  await client(nodeId).send(new DeleteBucketCommand({ Bucket: bucket }))
}

// Single-object HEAD, mainly for the user metadata: reference-backed objects
// expose aruna-last-refresh / aruna-source-etag there (lib/references.ts).
async function headObject(bucket: string, key: string, nodeId?: string | null): Promise<ObjectHead> {
  const response = await client(nodeId).send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  return {
    size: response.ContentLength,
    contentType: response.ContentType,
    etag: response.ETag?.replaceAll('"', ''),
    lastModified: response.LastModified,
    metadata: response.Metadata ?? {},
  }
}

async function downloadUrl(bucket: string, key: string, nodeId?: string | null): Promise<string> {
  return getSignedUrl(client(nodeId), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 900,
  })
}

// Fetch an object's bytes in the browser through a short-lived presigned GET so
// previews can read content directly. A cross-origin fetch needs the bucket to
// allow this portal's origin (CORS); when it does not the browser rejects with
// a TypeError, which the caller treats as the known CORS gap.
async function fetchObject(bucket: string, key: string, nodeId?: string | null): Promise<Response> {
  const url = await downloadUrl(bucket, key, nodeId)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`The object could not be fetched (HTTP ${response.status}).`)
  return response
}

async function getObjectText(bucket: string, key: string, nodeId?: string | null): Promise<string> {
  return (await fetchObject(bucket, key, nodeId)).text()
}

async function getObjectBlob(bucket: string, key: string, nodeId?: string | null): Promise<Blob> {
  return (await fetchObject(bucket, key, nodeId)).blob()
}

// One profile artifact (or a pasted document itself) fetched as text. A URL that
// maps to a bucket on one of this realm's nodes is read through an authenticated
// presigned GetObject, the same signed path the profiles view uses, so it works
// even when the object is not anonymously public or its bucket predates the
// public-read CORS rule. A portal DRS id (a w3id data URL or content-hash ARN,
// not the GA4GH drs:// scheme) resolves through the connected node's own
// download endpoint rather than following an anonymous w3id.org redirect that
// drops CORS. Anything else is a genuinely external host, fetched directly by
// the browser and subject to that host's CORS policy. Shared by the crate
// importer and the SHACL attach block (via useArtifactFetch) and by
// loadRoCrate when resolving externalized profile artifacts.
export async function fetchUrlText(target: string): Promise<string> {
  const object = hasActiveKey.value ? resolveObjectUrl(target) : null
  if (object) return getObjectText(object.bucket, object.key, object.nodeId)
  if (isDrsReference(target) && !/^drs:\/\//i.test(target)) return fetchDrsText(target)
  // Published profile artifacts keep their URL across updates, so revalidate
  // instead of trusting the HTTP cache's heuristic freshness.
  const response = await fetch(target, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Fetch failed (${response.status} ${response.statusText}).`)
  return response.text()
}

// Resolve a portal DRS id through the connected node's GA4GH download endpoint,
// carrying the bearer token so non-public objects resolve too. The endpoint
// redirects to a presigned object URL the browser then reads; a remote host that
// still refuses cross-origin reads surfaces as a TypeError, the same honest CORS
// gap a raw fetch would hit, so callers can advise download-and-upload.
async function fetchDrsText(id: string): Promise<string> {
  const base = apiBaseUrl.value
  if (!base) throw new Error('Resolving that DRS id needs the node API endpoint, which is not known yet.')
  const response = await fetch(drsDownloadHref(base, id), {
    headers: authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {},
  })
  if (!response.ok) throw new Error(`DRS resolve failed (${response.status} ${response.statusText}).`)
  return response.text()
}

export function s3ErrorMessage(err: unknown): string {
  if (isS3PurgeInProgressError(err)) return PURGE_IN_PROGRESS_MESSAGE
  if (err && typeof err === 'object') {
    const error = err as { name?: string; message?: string }
    if (error.name && error.message) return `${error.name}: ${error.message}`
    if (error.message) return error.message
  }
  return String(err)
}

export const PURGE_IN_PROGRESS_MESSAGE =
  'A purge is running for this location; retry when it completes.'

export function isS3PurgeInProgressError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as {
    name?: string
    Code?: string
    code?: string
    status?: number
    statusCode?: number
    $metadata?: { httpStatusCode?: number }
  }
  const status = error.$metadata?.httpStatusCode ?? error.statusCode ?? error.status
  const purgeCode = [error.name, error.Code, error.code].includes('PurgeInProgress')
  return purgeCode && (status === undefined || status === 503)
}

// DeleteBucket refuses a non-empty bucket with the S3 code "BucketNotEmpty"
// (HTTP 409). After a full object purge this only happens on a versioning-
// enabled store, where noncurrent versions and delete markers survive, or
// while an open multipart upload remains. A browser-side current-key sweep
// cannot prove either condition absent.
export function isS3BucketNotEmptyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; Code?: string }
  return error.name === 'BucketNotEmpty' || error.Code === 'BucketNotEmpty'
}

const S3_AUTH_ERROR_NAMES = new Set([
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'ExpiredToken',
  'TokenRefreshRequired',
  'InvalidToken',
  'AccessDenied',
])

// The node rejects writes above the group's grace ceiling with the custom
// S3 code "QuotaExceeded" and HTTP 403 (aruna api/src/s3/error.rs). The SDK
// exposes the code as the error name.
export function isS3QuotaError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { name?: string }).name === 'QuotaExceeded')
}

// A request that never produced an HTTP response: the endpoint is unreachable
// or the browser blocked it (CORS rejections surface as an opaque fetch
// TypeError). Distinct from auth/quota errors, which prove the node answered —
// remote browsing degrades to an info panel on this class of failure.
export function isS3NetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
  if (error.$metadata?.httpStatusCode !== undefined) return false
  if (error.name === 'TypeError' || error.name === 'NetworkError' || error.name === 'NetworkingError') {
    return true
  }
  const message = error.message ?? ''
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message)
}

// A rejected or expired session surfaces as one of these SDK error names or as
// a 401/403 from the node. Keep those distinct from transient network faults so
// the UI can offer to open a fresh session.
export function isS3AuthError(err: unknown): boolean {
  // A full group is a 403 too; never misreport it as "credentials rejected".
  if (isS3QuotaError(err)) return false
  if (err && typeof err === 'object') {
    const error = err as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (error.name && S3_AUTH_ERROR_NAMES.has(error.name)) return true
    const status = error.$metadata?.httpStatusCode
    if (status === 401 || status === 403) return true
  }
  return false
}

export function useS3() {
  return {
    sessions,
    sessionRevision,
    activeSession,
    activeContext,
    activeKey,
    hasActiveKey,
    endpoint,
    connectedEndpoint,
    endpointForNode,
    nodeIdFor: normalizeNodeId,
    resolveObjectUrl,
    activateContext,
    clearSessions,
    referenceForContext,
    sessionState,
    contextMismatch,
    canRead: (bucket: string, key?: string, nodeId?: string | null) =>
      canAccess('read', bucket, key, nodeId),
    canWrite: (bucket: string, key?: string, nodeId?: string | null) =>
      canAccess('write', bucket, key, nodeId),
    canWritePrefix,
    canDeletePrefix,
    listBuckets,
    createBucket,
    allowPublicReadCors,
    putTextObject,
    listObjects,
    listObjectsRecursive,
    createFolder,
    uploadObject,
    deleteObject,
    deletePrefix,
    deleteBucket,
    headObject,
    downloadUrl,
    getObjectText,
    getObjectBlob,
    fetchUrlText,
  }
}
