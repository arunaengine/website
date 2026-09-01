import { computed } from 'vue'
import type { Node, Realm } from '@/data/types'
import {
  apiRequest,
  type InfoResponse,
  type RealmInfoResponse,
  type RealmQuotaConfig,
  type UsageResponse,
} from '@/lib/api'
import { colorFor, shortId, truncateLabel } from './format'
import {
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
  const [info, realm, usage] = await Promise.allSettled([
    apiRequest<InfoResponse>('/system/info', {}, context.client),
    apiRequest<RealmInfoResponse>('/system/realm', {}, context.client),
    apiRequest<UsageResponse>('/system/usage', {}, context.client),
  ])
  if (context.epoch !== sessionEpoch.value) return
  if (info.status === 'fulfilled') nodeInfo.value = info.value
  if (realm.status === 'fulfilled') realmInfo.value = realm.value
  usageInfo.value = usage.status === 'fulfilled' ? usage.value : null
  if (info.status === 'rejected' && realm.status === 'rejected') throw info.reason
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
