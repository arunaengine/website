// Reads GET /data/blobs/locations together with the executor kinds nodes advertise
// in GET /info/realm, and says whether the work could run where the data
// already is. This is a hint about the inputs a run declares, not the plan:
// the planner screens every advertisement itself and seals its own decision.
import type { BlobLocationsResponse } from '@/lib/api'

export type LocalityVerdict = 'compute-to-data-possible' | 'data-will-move' | 'unknown'

export interface LocalityHint {
  verdict: LocalityVerdict
  /** Nodes reporting a stored copy. */
  presentNodeIds: string[]
  /** Nodes with a copy on its way. */
  pendingNodeIds: string[]
  /** Nodes that resolve the version but hold no bytes for it. */
  notStoredNodeIds: string[]
  /** Nodes that both hold a copy and advertise a compute backend. */
  computeNodeIds: string[]
  /** False when a copy may be missing from the answer, not that none exists. */
  complete: boolean
  summary: string
}

// A denied or unreachable node is neither a holder nor evidence of absence, so
// it only ever weakens the verdict to "unknown".
export function localityHint(
  locations: BlobLocationsResponse,
  executorsByNode: ReadonlyMap<string, string[]>,
): LocalityHint {
  const byState = (state: string) =>
    locations.copies.filter((copy) => copy.state === state).map((copy) => copy.node_id)
  const presentNodeIds = [...new Set(byState('present'))]
  const pendingNodeIds = [...new Set(byState('pending'))]
  const notStoredNodeIds = [...new Set(byState('not-stored'))]
  const undecided = locations.copies.some(
    (copy) => copy.state === 'denied' || copy.state === 'unreachable',
  )
  const computeNodeIds = presentNodeIds.filter((nodeId) => (executorsByNode.get(nodeId)?.length ?? 0) > 0)

  let verdict: LocalityVerdict
  let summary: string
  if (computeNodeIds.length) {
    verdict = 'compute-to-data-possible'
    summary = `A copy already sits on ${computeNodeIds.length === 1 ? 'a node' : 'nodes'} that can run compute, so this input may need no transfer.`
  } else if (presentNodeIds.length) {
    verdict = 'data-will-move'
    summary = 'Every node holding a copy advertises no compute backend, so this input would have to be moved to the node that runs the work.'
  } else if (pendingNodeIds.length) {
    verdict = 'unknown'
    summary = 'A copy is still on its way; where this input will be readable from is not settled yet.'
  } else {
    verdict = 'unknown'
    summary = 'No node reported a stored copy of this input.'
  }
  if (!locations.complete || undecided) {
    verdict = verdict === 'data-will-move' ? 'unknown' : verdict
    summary = `${summary} This view is incomplete, so a copy may exist that it did not find.`
  }

  return {
    verdict,
    presentNodeIds,
    pendingNodeIds,
    notStoredNodeIds,
    computeNodeIds,
    complete: locations.complete && !undecided,
    summary,
  }
}
