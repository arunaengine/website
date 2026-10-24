// What the portal shows of a bucket stored on more nodes.
import type { Coverage, DataStrategy, MemberState, PresetId, RangeMode } from '@/lib/distributedMock'

export interface DistributedMember {
  nodeId: string
  state: MemberState
  strategy: DataStrategy
  coverage: Coverage
  lag: string
  unreachableSince?: string
}

export interface DistributedRange {
  id: string
  lower: string
  upper: string
  /** The node that writes the range. */
  coordinator: string
  epoch: number
  /** Nodes that keep a copy of the range. */
  replicas: string[]
  objects: number
  bytes: number
  refreshed: string
  degradedSince?: string
}

export interface DistributedBucket {
  name: string
  preset: PresetId
  members: DistributedMember[]
  ranges: DistributedRange[]
  refresh: string
  mode: RangeMode
  searchIndex: boolean
  created: string
}

// An ordinary bucket lives on one node. Only a bucket on more nodes has the Nodes tab.
export function isMulti(bucket: DistributedBucket): boolean {
  return bucket.members.length > 1
}

export function degradedRanges(bucket: DistributedBucket): DistributedRange[] {
  return bucket.ranges.filter((range) => range.degradedSince)
}

/** Role paths like data/node-1/bakrep/** by bucket: the nodes each one names. */
export function grantTargets(suffixes: readonly string[]): Map<string, string[]> {
  const named = new Map<string, string[]>()
  for (const suffix of suffixes) {
    const [area, node, bucket] = suffix.split('/')
    if (area !== 'data' || !node || !bucket) continue
    named.set(bucket, [...(named.get(bucket) ?? []), node])
  }
  return named
}
