import { computed } from 'vue'
import { nodeApiBase } from '@/components/nodes/node-probe'
import type { Node, Realm } from '@/data/types'
import {
  ApiError,
  apiRequest,
  type InfoResponse,
  type RealmInfoResponse,
  type RealmQuotaConfig,
  type UsageResponse,
} from '@/lib/api'
import { realmIdText, type RealmDescriptor, type Signed } from '@/lib/federation/descriptor'
import { colorFor, shortId, truncateLabel } from './format'
import {
  federationName,
  metadataItems,
  nodeInfo,
  realmInfo,
  refreshContext,
  request,
  saving,
  sessionEpoch,
  usageInfo,
} from './state'

export async function loadInfo(context = refreshContext()) {
  // Partial tolerance: one endpoint failing or degrading (e.g. realm
  // discovery with offline nodes) must not blank the others' data; keep the
  // last-known values and only fail when both core calls are down.
  // /system/usage is not deployed everywhere yet; hide the stats on failure.
  const [info, realm, usage, descriptor] = await Promise.allSettled([
    apiRequest<InfoResponse>('/system/info', {}, context.client),
    apiRequest<RealmInfoResponse>('/system/realm', {}, context.client),
    apiRequest<UsageResponse>('/system/usage', {}, context.client),
    // The federation name; a realm without federation settings answers 404.
    apiRequest<Signed<RealmDescriptor>>('/system/realm/descriptor', {}, context.client),
  ])
  if (context.epoch !== sessionEpoch.value) return
  const known = realmInfo.value?.realm_id
  if (info.status === 'fulfilled') nodeInfo.value = info.value
  if (realm.status === 'fulfilled') realmInfo.value = realm.value
  usageInfo.value = usage.status === 'fulfilled' ? usage.value : null
  const signed = descriptor.status === 'fulfilled' ? descriptor.value?.payload : undefined
  const own = signed && realmIdText(signed.realm_id) === realmInfo.value?.realm_id
  // Only this realm's descriptor or a 404 decides the name; other failures keep a known one.
  const absent = descriptor.status === 'rejected' && descriptor.reason instanceof ApiError && descriptor.reason.status === 404
  if (own) federationName.value = signed.name?.trim() ?? ''
  else if (absent || realmInfo.value?.realm_id !== known) federationName.value = ''
  if (info.status === 'rejected' && realm.status === 'rejected') throw info.reason
}

export interface RealmView {
  info: InfoResponse
  realm: RealmInfoResponse
}

// The published management urls first, then every other realm member; never a device.
function realmNodeBases(known: RealmInfoResponse): string[] {
  const published = (known.management_urls ?? []).map((url) => {
    const base = url.replace(/\/+$/, '')
    return base.endsWith('/api/v1') ? base : `${base}/api/v1`
  })
  const members = (known.nodes ?? []).filter((node) => node.kind !== 'user').map(nodeApiBase)
  return [...new Set([...published, ...members])].filter((base): base is string => !!base)
}

// A dead candidate gives up after this, so the next one is tried well within a refresh.
const PANEL_READ_TIMEOUT_MS = 5_000
// The node that answered last, tried first on the next read in the same session and realm.
let lastAnswered: { key: string; base: string } | null = null
let running: { key: string; view: Promise<RealmView | null> } | null = null

async function readRealmNode(baseUrl: string, context: ReturnType<typeof refreshContext>) {
  const client = { ...context.client, baseUrl }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PANEL_READ_TIMEOUT_MS)
  try {
    return await Promise.all([
      apiRequest<InfoResponse>('/system/info', { signal: controller.signal }, client),
      apiRequest<RealmInfoResponse>('/system/realm', { signal: controller.signal }, client),
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

async function findRealmView(known: RealmInfoResponse, context: ReturnType<typeof refreshContext>, key: string) {
  const bases = realmNodeBases(known)
  const last = lastAnswered?.key === key ? lastAnswered.base : null
  if (last && bases.includes(last)) bases.unshift(...bases.splice(bases.indexOf(last), 1))
  for (const baseUrl of bases) {
    const view = await readRealmNode(baseUrl, context)
    // An answer without the realm members is the anonymous view, no better than the device's.
    if (view?.[1].realm_id === known.realm_id && view[1].nodes?.length) {
      lastAnswered = { key, base: baseUrl }
      return { info: view[0], realm: view[1] }
    }
  }
  return null
}

/**
 * The realm as one of its nodes sees it, for the desktop's realm nodes panel: a device node
 * takes no part in the live heartbeat protocol. Null when no realm node of this realm answers.
 * Calls in the same session and realm share one running lookup.
 */
export function loadRealmView(context = refreshContext()): Promise<RealmView | null> {
  const known = realmInfo.value
  if (!known) return Promise.resolve(null)
  const key = `${context.epoch}:${known.realm_id}`
  if (running?.key === key) return running.view
  const view = findRealmView(known, context, key).finally(() => {
    if (running?.view === view) running = null
  })
  running = { key, view }
  return view
}

/** API base of a realm node of this session and realm, or null when none answers. */
export async function realmNodeBase(context = refreshContext()): Promise<string | null> {
  const key = `${context.epoch}:${realmInfo.value?.realm_id}`
  if (lastAnswered?.key !== key) await loadRealmView(context)
  return lastAnswered?.key === key ? lastAnswered.base : null
}

export async function setRealmQuota(config: RealmQuotaConfig): Promise<RealmQuotaConfig> {
  saving.value = true
  try {
    const stored = await request<RealmQuotaConfig>('/system/realm/quota', {
      method: 'PUT',
      body: JSON.stringify(config),
    })
    if (realmInfo.value) realmInfo.value = { ...realmInfo.value, quota: stored }
    return stored
  } finally {
    saving.value = false
  }
}

export const realm = computed<Realm>(() => {
  const id = realmInfo.value?.realm_id ?? nodeInfo.value?.node.realm_id ?? 'unknown'
  const description = realmInfo.value?.description?.trim() ?? ''
  // The federation name, then the realm description, then the short id.
  const displayName = federationName.value || description || shortId(id)
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

// Quota edits are only accepted by a management node; every other kind 403s.
// The realm info says which kind this is to anyone; the node info to a token.
export const isManagementNode = computed<boolean>(
  () => realmInfo.value?.is_management_node ?? nodeInfo.value?.node.capabilities === 'management',
)

export const nodes = computed<Node[]>(() => {
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
    replicaFactor: realmInfo.value?.metadata_replication.default_replication_factor ?? null,
    established: '',
  }))
})
