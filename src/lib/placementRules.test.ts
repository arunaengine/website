import { describe, expect, it } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'
import { advertisedExecutors, matchingNodes, publishedLabels, selectorAdmits, nodeSubject } from './placementRules'

function node(
  nodeId: string,
  location: string | null,
  labels: Record<string, string> = {},
  executors: string[] = [],
): RealmNodeInfo {
  return {
    node_id: nodeId,
    kind: 'server',
    configured: true,
    present: true,
    connection_status: 'connected',
    placement: location ? { location, weight: 100, full: false, draining: false } : null,
    info: {
      executors: executors.map((kind) => ({ kind, file_staging: true, direct_s3: false })),
      labels,
      urls: {},
      utilization: { storage_bytes_used: 0, heartbeat_at_ms: 0 },
      updated_at_ms: 0,
    },
  }
}

const realm: RealmNodeInfo[] = [
  node('node-eu', 'eu-west', { tier: 'cold' }, ['docker']),
  node('node-eu-2', 'eu-west', { tier: 'hot' }),
  node('node-us', 'us-east', { tier: 'cold' }, ['docker', 'apptainer']),
  node('node-unmapped', null),
]

describe('placement rule preview', () => {
  it('ands the fields of one card', () => {
    const subject = nodeSubject(realm[0])

    expect(selectorAdmits({ location: 'eu-west', labels: [{ key: 'tier', value: 'cold' }] }, subject)).toBe(true)
    expect(selectorAdmits({ location: 'eu-west', labels: [{ key: 'tier', value: 'hot' }] }, subject)).toBe(false)
    expect(selectorAdmits({ executor_kind: 'apptainer', labels: [] }, subject)).toBe(false)
  })

  it('admits nothing for a card with no condition', () => {
    expect(matchingNodes([{ labels: [] }], realm)).toEqual([])
  })

  it('ors the cards across the realm', () => {
    const matched = matchingNodes(
      [
        { location: 'eu-west', labels: [] },
        { executor_kind: 'apptainer', labels: [] },
      ],
      realm,
    )

    expect(matched).toEqual(['node-eu', 'node-eu-2', 'node-us'])
  })

  it('offers only what the realm publishes', () => {
    expect(publishedLabels(realm)).toEqual([
      { key: 'tier', value: 'cold' },
      { key: 'tier', value: 'hot' },
    ])
    expect(advertisedExecutors(realm)).toEqual(['apptainer', 'docker'])
  })
})
