import { computed, ref, shallowRef, watch } from 'vue'
import {
  apiRequest,
  type CreateS3SessionRequest,
  type S3SessionResponse,
  type S3SessionRestriction,
} from '@/lib/api'
import { useAruna } from '../useAruna'
import { destroyClients, dropClients } from './cache'
import { connectedEndpoint, endpointForNode, localNodeId, nodeApiBase } from './endpoints'
import { s3ErrorMessage } from './errors'

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

const { authToken, apiBaseUrl, currentUser, nodeInfo, realmInfo } = useAruna()

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

export const sessions = shallowRef(new Map<string, PortalS3Session>())
export const sessionRevision = ref(0)
const activeSessionKey = ref<string | null>(null)
const pendingMints = new Map<string, Promise<PortalS3Session>>()
let boundaryGeneration = 0
let activationGeneration = 0
let refreshTimer: ReturnType<typeof globalThis.setTimeout> | undefined
let expiryTimer: ReturnType<typeof globalThis.setTimeout> | undefined

export function storeKey(nodeId: string, groupId: string): string {
  return `${nodeId}\u0000${groupId}`
}

export function normalizeNodeId(nodeId?: string | null): string | null {
  if (nodeId === undefined) {
    return activeSession.value?.issuerNodeId ?? localNodeId()
  }
  if (!nodeId || nodeId === localNodeId()) return localNodeId()
  return nodeId
}

function putSession(key: string, session: PortalS3Session): void {
  const previous = sessions.value.get(key)
  if (
    previous &&
    (previous.accessKeyId !== session.accessKeyId ||
      previous.secretAccessKey !== session.secretAccessKey ||
      previous.sessionToken !== session.sessionToken)
  ) {
    dropClients(key)
  }
  const next = new Map(sessions.value)
  next.set(key, session)
  sessions.value = next
  sessionRevision.value++
}

export function sessionUsable(
  session: PortalS3Session | null | undefined,
  now = Date.now(),
): session is PortalS3Session {
  return Boolean(session && session.state !== 'expired' && session.expiresAt > now)
}

export const activeSession = computed(() =>
  activeSessionKey.value ? (sessions.value.get(activeSessionKey.value) ?? null) : null,
)

export const activeContext = computed<S3ActiveContext | null>(() => {
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

export const activeKey = computed<S3Key | null>(() => {
  const session = activeSession.value
  return sessionUsable(session)
    ? {
        accessKeyId: session.accessKeyId,
        secretAccessKey: session.secretAccessKey,
        sessionToken: session.sessionToken,
      }
    : null
})

export const hasActiveKey = computed(() => activeKey.value !== null)
export const endpoint = computed(() => activeSession.value?.s3Endpoint ?? connectedEndpoint.value)

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
      '/access/s3/sessions',
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
      `/access/s3/sessions/${encodeURIComponent(session.accessKeyId)}/refresh`,
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

export function markSessionUsed(key: string): void {
  const session = sessions.value.get(key)
  if (!sessionUsable(session)) return
  putSession(key, { ...session, lastUsedAt: Date.now() })
  if (activeSessionKey.value === key) scheduleActiveSession()
}

export async function activateContext(nodeId: string | null, groupId: string): Promise<PortalS3Session> {
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

/** Reuses the active session when it already serves the group. */
// Single-flighted: concurrent callers would race the activation generation
// and the server-side mint, leaving no active session behind.
const ensureFlights = new Map<string, Promise<void>>()
export async function ensureSession(groupId: string): Promise<void> {
  if (activeKey.value && activeContext.value?.groupId === groupId) return
  const inFlight = ensureFlights.get(groupId)
  if (inFlight) return inFlight
  const flight = activateContext(null, groupId)
    .then(() => undefined)
    .finally(() => {
      ensureFlights.delete(groupId)
    })
  ensureFlights.set(groupId, flight)
  return flight
}

export function clearSessions(): void {
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

export function sessionForReference(reference: S3SessionReference): PortalS3Session | null {
  const session = sessions.value.get(storeKey(reference.nodeId, reference.groupId)) ?? null
  if (!session || session.accessKeyId !== reference.accessKeyId) return null
  if (!sessionUsable(session)) {
    expireSession(storeKey(reference.nodeId, reference.groupId))
    return null
  }
  return session
}

export function referenceForContext(nodeId: string | null, groupId: string): S3SessionReference | null {
  const issuerNodeId = normalizeNodeId(nodeId)
  if (!issuerNodeId) return null
  const session = sessions.value.get(storeKey(issuerNodeId, groupId))
  return sessionUsable(session)
    ? { nodeId: issuerNodeId, groupId, accessKeyId: session.accessKeyId }
    : null
}

export function sessionState(reference: S3SessionReference): 'usable' | 'expired' | 'missing' {
  const session = sessions.value.get(storeKey(reference.nodeId, reference.groupId))
  if (!session || session.accessKeyId !== reference.accessKeyId) return 'missing'
  if (!sessionUsable(session)) {
    expireSession(storeKey(reference.nodeId, reference.groupId))
    return 'expired'
  }
  return 'usable'
}

export function contextMismatch(nodeId: string | null): { issuerNodeId: string; requiredNodeId: string } | null {
  const session = activeSession.value
  const requiredNodeId = normalizeNodeId(nodeId)
  if (!session || !requiredNodeId || session.issuerNodeId === requiredNodeId) return null
  return { issuerNodeId: session.issuerNodeId, requiredNodeId }
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

export function canAccess(
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

export function canWritePrefix(bucket: string, prefix: string, nodeId?: string | null): boolean {
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

export function canDeletePrefix(bucket: string, prefix: string, nodeId?: string | null): boolean {
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
