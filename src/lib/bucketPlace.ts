// Readable names for the place a bucket is stored: this computer, another
// device, or a realm node with its location. Kind and id go to a tooltip.
import { kindLabel } from '@/components/nodes/node-display'
import type { RealmNodeDisplay } from '@/composables/useRealmNodes'
import type { InfoResponse } from '@/lib/api'
import { truncateMiddle } from '@/lib/utils'

type PlaceNode = Pick<RealmNodeDisplay, 'nodeId' | 'kind' | 'label' | 'isLocal' | 'location'>

export function placeName(node: PlaceNode): string {
  if (node.kind === 'user') return node.isLocal ? 'This computer' : node.label
  return node.location ? `${node.label} · ${node.location}` : node.label
}

export function placeTitle(node: Pick<PlaceNode, 'nodeId' | 'kind'>): string {
  return `${kindLabel[node.kind]} ${truncateMiddle(node.nodeId, 8, 4)}`
}

// The realm node the shell remembers as its realm, else the first reachable one.
export function defaultPlace(
  nodes: ReadonlyArray<Pick<RealmNodeDisplay, 'nodeId' | 'kind' | 'reachable' | 'apiBase' | 's3Url'>>,
  realmUrl: string | null | undefined,
): string | null {
  const realm = nodes.filter((node) => node.kind !== 'user')
  const origin = originOf(realmUrl)
  const remembered = origin
    ? realm.find((node) => [node.apiBase, node.s3Url].some((url) => originOf(url) === origin))
    : undefined
  return (remembered ?? realm.find((node) => node.reachable) ?? realm[0])?.nodeId ?? null
}

function originOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Space left under the node's storage quotas; null when no backend reports one. */
export function freeSpace(info: Pick<InfoResponse, 'services'> | null): number | null {
  let total: number | null = null
  for (const backend of info?.services.blob?.backends ?? []) {
    if (typeof backend.quota_bytes !== 'number' || typeof backend.used_bytes !== 'number') continue
    total = (total ?? 0) + Math.max(0, backend.quota_bytes - backend.used_bytes)
  }
  return total
}
