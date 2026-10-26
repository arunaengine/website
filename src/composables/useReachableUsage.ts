// The data the caller can reach in their groups: each bucket's usage, asked of the node that holds
// it and summed into stored bytes, referenced bytes and objects. A distributed bucket counts once.
// A bucket whose usage cannot be read, or whose node reports no referenced bytes, stays unknown.
import { computed, ref } from 'vue'
import { nodeInfo } from '@/composables/aruna/state'
import { useAruna } from '@/composables/useAruna'
import { mapLimit } from '@/composables/useMyGroupsUsage'
import type { BucketSearchHit, BucketUsageResponse } from '@/lib/api'
import { mergeSets } from '@/lib/distribution'
import { errorMessage } from '@/lib/utils'
import { isHiddenBucket } from '@/lib/workspaces'

const PAGE = 50
// At most 1000 buckets per group are counted; a longer list says it was cut.
const MAX_PAGES = 20

export interface UsageSum {
  stored: number
  referenced: number
  objects: number
  buckets: number
  /** Buckets whose usage could not be read: nothing of them is counted. */
  unread: number
  /** Buckets whose node reports no referenced bytes. */
  referencedUnknown: number
  /** A counted number is a lower bound. */
  partial: boolean
}

export interface GroupReach extends UsageSum {
  groupId: string
  name: string
  /** The bucket list failed; nothing of the group is counted. */
  error: string | null
  /** A node did not answer the bucket list, or it was cut: buckets may be missing. */
  missing: boolean
}

export function emptySum(): UsageSum {
  return { stored: 0, referenced: 0, objects: 0, buckets: 0, unread: 0, referencedUnknown: 0, partial: false }
}

/** Adds one bucket's usage, or an unread bucket for null. */
export function addUsage(sum: UsageSum, usage: BucketUsageResponse | null): UsageSum {
  if (!usage) return { ...sum, buckets: sum.buckets + 1, unread: sum.unread + 1 }
  const known = usage.referenced_bytes != null
  return {
    stored: sum.stored + usage.logical_bytes,
    referenced: sum.referenced + (usage.referenced_bytes ?? 0),
    objects: sum.objects + usage.objects,
    buckets: sum.buckets + 1,
    unread: sum.unread,
    referencedUnknown: sum.referencedUnknown + (known ? 0 : 1),
    partial: sum.partial || !usage.complete,
  }
}

export function addSums(left: UsageSum, right: UsageSum): UsageSum {
  return {
    stored: left.stored + right.stored,
    referenced: left.referenced + right.referenced,
    objects: left.objects + right.objects,
    buckets: left.buckets + right.buckets,
    unread: left.unread + right.unread,
    referencedUnknown: left.referencedUnknown + right.referencedUnknown,
    partial: left.partial || right.partial,
  }
}

export function useReachableUsage() {
  const { myGroups, searchBuckets, getBucketUsage, sessionEpoch } = useAruna()
  const groups = ref<GroupReach[]>([])
  const loading = ref(false)
  let runs = 0

  const isLocal = (nodeId: string) => nodeId === nodeInfo.value?.node.peer_id

  async function readGroup(groupId: string, name: string, current: () => boolean): Promise<GroupReach> {
    const hits: BucketSearchHit[] = []
    let cursor: string | undefined
    let silent = 0
    let cut = false
    try {
      for (let page = 0; ; page++) {
        if (page === MAX_PAGES) {
          cut = true
          break
        }
        const answer = await searchBuckets('', { limit: PAGE, groupId, cursor })
        if (!current()) break
        hits.push(...answer.hits.filter((hit) => hit.group_id === groupId && !isHiddenBucket(hit.bucket)))
        silent = Math.max(silent, answer.nodes_failed)
        cursor = answer.next_cursor ?? undefined
        if (!cursor) break
      }
    } catch (cause) {
      return { groupId, name, ...emptySum(), error: errorMessage(cause), missing: true }
    }
    const buckets = mergeSets(hits, isLocal)
    const usages: (BucketUsageResponse | null)[] = new Array(buckets.length).fill(null)
    await mapLimit([...buckets.keys()], 4, async (index) => {
      const bucket = buckets[index]
      if (!current()) return
      usages[index] = await getBucketUsage(bucket.bucket, isLocal(bucket.node_id) ? null : bucket.node_id).catch(() => null)
    })
    const sum = usages.reduce(addUsage, emptySum())
    return { groupId, name, ...sum, error: null, missing: silent > 0 || cut }
  }

  async function load() {
    const run = ++runs
    const epoch = sessionEpoch.value
    const current = () => run === runs && epoch === sessionEpoch.value
    loading.value = true
    try {
      const found = await Promise.all(myGroups.value.map((group) => readGroup(group.id, group.name, current)))
      if (current()) groups.value = found.sort((a, b) => a.name.localeCompare(b.name))
    } finally {
      if (run === runs) loading.value = false
    }
  }

  const total = computed(() => groups.value.reduce<UsageSum>(addSums, emptySum()))
  return { groups, total, loading, load }
}
