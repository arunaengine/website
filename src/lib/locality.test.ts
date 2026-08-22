import { describe, expect, it } from 'vitest'
import { localityHint } from './locality'
import type { BlobCopyResponse, BlobLocationsResponse } from './api'

function copy(nodeId: string, state: BlobCopyResponse['state']): BlobCopyResponse {
  return { node_id: nodeId, local: false, bucket: 'b', key: 'k', state }
}

function locations(copies: BlobCopyResponse[], complete = true): BlobLocationsResponse {
  return { bucket: 'b', key: 'k', version_id: 'v', copies, complete, limits: [] }
}

const executors = new Map([
  ['compute-node', ['docker']],
  ['storage-node', []],
])

describe('input locality hint', () => {
  it('sees compute-to-data when a holder advertises an executor', () => {
    const hint = localityHint(locations([copy('compute-node', 'present')]), executors)

    expect(hint.verdict).toBe('compute-to-data-possible')
    expect(hint.computeNodeIds).toEqual(['compute-node'])
  })

  it('expects a move when no holder can run compute', () => {
    const hint = localityHint(locations([copy('storage-node', 'present')]), executors)

    expect(hint.verdict).toBe('data-will-move')
    expect(hint.computeNodeIds).toEqual([])
  })

  it('weakens a move verdict to unknown on an incomplete scan', () => {
    // A missed holder could be exactly the node that runs compute.
    const hint = localityHint(locations([copy('storage-node', 'present')], false), executors)

    expect(hint.verdict).toBe('unknown')
    expect(hint.complete).toBe(false)
    expect(hint.summary).toContain('incomplete')
  })

  it('treats a denied or unreachable node as incomplete, not absent', () => {
    const hint = localityHint(
      locations([copy('storage-node', 'present'), copy('secret-node', 'denied')]),
      executors,
    )

    expect(hint.complete).toBe(false)
    expect(hint.verdict).toBe('unknown')
  })

  it('separates a queued copy from a stored one', () => {
    const hint = localityHint(locations([copy('compute-node', 'pending')]), executors)

    expect(hint.verdict).toBe('unknown')
    expect(hint.presentNodeIds).toEqual([])
    expect(hint.pendingNodeIds).toEqual(['compute-node'])
  })

  it('does not count a node the version has no bytes on', () => {
    const hint = localityHint(locations([copy('compute-node', 'not-stored')]), executors)

    expect(hint.verdict).toBe('unknown')
    expect(hint.notStoredNodeIds).toEqual(['compute-node'])
    expect(hint.summary).toContain('No node reported a stored copy')
  })
})
