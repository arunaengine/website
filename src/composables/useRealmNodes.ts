// Realm-node lookup shared by the cross-node search and bucket sync surfaces:
// node id → display name, published URLs and reachability, from the already
// loaded GET /info/realm (no extra requests).
import { computed } from 'vue'
import { useAruna } from './useAruna'
import { useDeviceStatus } from './useDeviceStatus'
import { nodeApiBase } from '@/components/nodes/node-probe'
import { givenName, kindLabel, nodeName } from '@/components/nodes/node-display'
import { isDesktop } from '@/lib/desktop'
import { truncateMiddle } from '@/lib/utils'
import type { RealmNodeInfo } from '@/lib/api'

export interface RealmNodeDisplay {
  nodeId: string
  kind: RealmNodeInfo['kind']
  /** Latest advertised node record, including custom placement labels. */
  info: RealmNodeInfo['info']
  /** Human label: a published name label when set, else "<kind> <short-id>". */
  label: string
  /** The label without the location the desktop adds to it. */
  name?: string
  /** The name the node was given (display name first, then its name labels); null without one. */
  given?: string | null
  /** Hover text for the label: the node id, or kind and short id in the desktop. */
  title?: string
  s3Url: string | null
  /** Published REST base including /api/v1, for cross-node API calls. */
  apiBase: string | null
  /** Presence-confirmed infrastructure node, or a device seen recently. */
  reachable: boolean
  isLocal: boolean
  /** Placement location; absent when unset or "default". */
  location?: string | null
  /** Executor kinds this node advertises; empty without a compute backend. */
  executorKinds: string[]
}

const nodeLabel = (node: RealmNodeInfo): string => nodeName(node)

/**
 * This computer's name: the realm's display name, then the one it was enrolled with, else "This
 * computer". The desktop shell does not hand the portal its stored label or the hostname yet.
 */
export function computerName(node?: Pick<RealmNodeInfo, 'info' | 'display_name'> | null): string {
  return (node && givenName(node)) || THIS_COMPUTER
}
/** The name of a computer without one; a "this computer" badge beside it would say it twice. */
export const THIS_COMPUTER = 'This computer'

// The desktop names places in words: this computer, any other node by the name rule.
function plainName(node: RealmNodeInfo, thisComputer: boolean): string {
  return thisComputer ? 'This computer' : nodeName(node)
}

// The plain name, with the node's location when it has one.
function placeName(node: RealmNodeInfo, thisComputer: boolean): string {
  const name = plainName(node, thisComputer)
  if (thisComputer) return name
  // "default" is the backend's placeholder for a node without a location.
  const location = node.placement?.location
  return location && location !== 'default' ? `${name}, ${location}` : name
}

export function useRealmNodes() {
  const { nodeInfo, realmInfo } = useAruna()
  const { identity } = useDeviceStatus()
  const desktop = isDesktop()

  const localNodeId = computed(() => nodeInfo.value?.node.peer_id ?? null)

  const nodes = computed<RealmNodeDisplay[]>(() =>
    (realmInfo.value?.nodes ?? []).map((node) => {
      const isLocal = node.node_id === localNodeId.value
      const thisComputer = node.node_id === identity.value?.nodeId
      return {
        nodeId: node.node_id,
        kind: node.kind,
        info: node.info,
        label: desktop ? placeName(node, thisComputer) : nodeLabel(node),
        name: desktop ? plainName(node, thisComputer) : nodeLabel(node),
        given: givenName(node),
        title: desktop ? `${kindLabel[node.kind]} ${truncateMiddle(node.node_id, 8, 4)}` : node.node_id,
        // The connected node's own S3 endpoint comes from /info even when the
        // node has not published a realm record yet.
        s3Url:
          node.info?.urls?.s3 ??
          (isLocal ? (nodeInfo.value?.services?.interfaces?.s3?.url ?? null) : null),
        apiBase: nodeApiBase(node),
        reachable:
          (node.present && node.connection_status === 'connected') ||
          node.connection_status === 'seen',
        isLocal,
        location: node.placement?.location && node.placement.location !== 'default' ? node.placement.location : null,
        executorKinds: (node.info?.executors ?? []).map((executor) => executor.kind),
      }
    }),
  )

  const byId = computed(() => new Map(nodes.value.map((node) => [node.nodeId, node])))

  // Node id → advertised executor kinds, for the data-locality hints.
  const executorsByNode = computed(
    () => new Map(nodes.value.map((node) => [node.nodeId, node.executorKinds])),
  )

  // Every executor kind the realm advertises, sorted. Empty when no node has
  // published an info document yet, which is not the same as "no compute".
  const executorKinds = computed(() =>
    [...new Set(nodes.value.flatMap((node) => node.executorKinds))].sort((a, b) => a.localeCompare(b)),
  )

  function nodeById(nodeId: string | null | undefined): RealmNodeDisplay | null {
    if (!nodeId) return null
    return byId.value.get(nodeId) ?? null
  }

  // Never empty: unknown node ids (e.g. a node that left the realm) still get
  // an honest short-id label.
  function displayName(nodeId: string | null | undefined): string {
    if (!nodeId) return 'this node'
    const known = nodeById(nodeId)?.label
    if (known) return known
    // Signed out, the realm lists only the public address of each node.
    const published = realmInfo.value?.public_nodes?.find((entry) => entry.node_id === nodeId)
    return published ? nodeName({ kind: 'server', rest_url: published.api_url }) : truncateMiddle(nodeId, 8, 6)
  }

  // A device is a person's own computer, never a place to pick for data or runs; inside the
  // desktop app the device it runs on is offered as "This computer".
  const offered = (node: RealmNodeDisplay) => node.kind !== 'user' || (desktop && node.isLocal)
  const targets = computed(() => nodes.value.filter(offered))

  /** Whether a node may be offered as a place; a node the realm does not list is not hidden. */
  function isTarget(nodeId: string | null | undefined): boolean {
    const node = nodeById(nodeId)
    return !node || offered(node)
  }

  function isLocalNode(nodeId: string | null | undefined): boolean {
    if (!nodeId) return true
    return nodeById(nodeId)?.isLocal ?? nodeId === localNodeId.value
  }

  return {
    nodes,
    targets,
    isTarget,
    localNodeId,
    nodeById,
    displayName,
    isLocalNode,
    executorsByNode,
    executorKinds,
  }
}
