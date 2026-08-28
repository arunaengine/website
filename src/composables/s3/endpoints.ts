import { computed } from 'vue'
import { parseS3Url } from '@/lib/tes'
import { useAruna } from '../useAruna'

const { nodeInfo, realmInfo, apiBaseUrl } = useAruna()

export const connectedEndpoint = computed(
  () =>
    nodeInfo.value?.services?.interfaces?.s3?.url ??
    realmInfo.value?.interfaces?.s3?.url ??
    null,
)

export function localNodeId(): string | null {
  return nodeInfo.value?.node.peer_id ?? null
}

export function nodeApiBase(nodeId: string): string | null {
  if (nodeId === localNodeId()) return apiBaseUrl.value
  const node = (realmInfo.value?.nodes ?? []).find((entry) => entry.node_id === nodeId)
  const url = (node?.info?.urls?.api ?? node?.rest_url ?? '').replace(/\/+$/, '')
  if (!url) return null
  return url.endsWith('/api/v1') ? url : `${url}/api/v1`
}

// Resolves the S3 endpoint serving `nodeId`; null/the local peer id map to the
// connected node. Resolution never changes the active session.
export function endpointForNode(nodeId?: string | null): string | null {
  if (!nodeId || nodeId === localNodeId()) return connectedEndpoint.value
  const node = (realmInfo.value?.nodes ?? []).find((entry) => entry.node_id === nodeId)
  return node?.info?.urls?.s3 ?? null
}

// Maps a path-style object URL (as stored in profile-crate `contentUrl`s) back to
// the bucket/key/node an authenticated GetObject needs. Tries the connected
// node's endpoint first, then every realm node's published S3 endpoint, so a
// crate published on a remote node still resolves. Returns null for hosts that
// belong to no known node, the genuinely external URLs a browser must fetch
// directly.
export function resolveObjectUrl(
  url: string,
): { bucket: string; key: string; nodeId: string | null } | null {
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
