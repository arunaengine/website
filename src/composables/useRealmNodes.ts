// Realm-node lookup shared by the federated search and bucket sync surfaces:
// node id → display name, published URLs and reachability, from the already
// loaded GET /info/realm (no extra requests).
import { computed } from 'vue'
import { useAruna } from './useAruna'
import { nodeApiBase } from '@/components/nodes/node-probe'
import { truncateMiddle } from '@/lib/utils'
import type { RealmNodeInfo } from '@/lib/api'

export interface RealmNodeDisplay {
  nodeId: string
  kind: RealmNodeInfo['kind']
  /** Human label: a published name label when set, else "<kind> <short-id>". */
  label: string
  s3Url: string | null
  /** Published REST base including /api/v1, for cross-node API calls. */
  apiBase: string | null
  /** connection_status === 'connected' && present. */
  reachable: boolean
  isLocal: boolean
}

function nodeLabel(node: RealmNodeInfo): string {
  const labels = node.info?.labels ?? {}
  const named = labels['name'] || labels['display_name']
  return named || `${node.kind} ${truncateMiddle(node.node_id, 8, 4)}`
}

export function useRealmNodes() {
  const { nodeInfo, realmInfo } = useAruna()

  const localNodeId = computed(() => nodeInfo.value?.node.peer_id ?? null)

  const nodes = computed<RealmNodeDisplay[]>(() =>
    (realmInfo.value?.nodes ?? []).map((node) => {
      const isLocal = node.node_id === localNodeId.value || node.kind === 'local'
      return {
        nodeId: node.node_id,
        kind: node.kind,
        label: nodeLabel(node),
        // The connected node's own S3 endpoint comes from /info even when the
        // node has not published a realm document yet.
        s3Url:
          node.info?.urls?.s3 ??
          (isLocal ? (nodeInfo.value?.services?.interfaces?.s3?.url ?? null) : null),
        apiBase: nodeApiBase(node),
        reachable: node.present && node.connection_status === 'connected',
        isLocal,
      }
    }),
  )

  const byId = computed(() => new Map(nodes.value.map((node) => [node.nodeId, node])))

  function nodeById(nodeId: string | null | undefined): RealmNodeDisplay | null {
    if (!nodeId) return null
    return byId.value.get(nodeId) ?? null
  }

  // Never empty: unknown node ids (e.g. a node that left the realm) still get
  // an honest short-id label.
  function displayName(nodeId: string | null | undefined): string {
    if (!nodeId) return 'this node'
    return nodeById(nodeId)?.label ?? truncateMiddle(nodeId, 8, 4)
  }

  function isLocalNode(nodeId: string | null | undefined): boolean {
    if (!nodeId) return true
    return nodeById(nodeId)?.isLocal ?? nodeId === localNodeId.value
  }

  return { nodes, localNodeId, nodeById, displayName, isLocalNode }
}
