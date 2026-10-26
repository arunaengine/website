// The data the caller can reach in their groups: each bucket's usage, asked of the node that holds
// it and summed into stored bytes, referenced bytes and objects. A distributed bucket counts once.
// A bucket whose usage cannot be read, or whose node reports no referenced bytes, stays unknown.
// The state is shared, so every dashboard part reads one listing.
import { computed, ref } from 'vue'
import { nodeInfo } from '@/composables/aruna/state'
import { useAruna } from '@/composables/useAruna'
import { listBuckets } from '@/composables/useBucketCount'
import { mapLimit } from '@/composables/useMyGroupsUsage'
import type { BucketUsageResponse } from '@/lib/api'
import { mergeSets } from '@/lib/distribution'
import { errorMessage } from '@/lib/utils'

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
  /** Listed hits, one per node that holds a bucket; above `buckets` for distributed buckets. */
  copies: number
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

const groups = ref<GroupReach[]>([])
const loading = ref(false)
let runs = 0
// A reload asked for while one runs waits for it, so frequent refreshes ask each bucket once.
let again = false
let account = ''

export function useReachableUsage() {
  const { myGroups, searchBuckets, getBucketUsage, sessionEpoch } = useAruna()

  const isLocal = (nodeId: string) => nodeId === nodeInfo.value?.node.peer_id

  async function readGroup(groupId: string, name: string, current: () => boolean): Promise<GroupReach> {
    let listing
    try {
      listing = await listBuckets(searchBuckets, groupId, current)
    } catch (cause) {
      return { groupId, name, ...emptySum(), error: errorMessage(cause), missing: true, copies: 0 }
    }
    const { hits } = listing
    const buckets = mergeSets(hits, isLocal)
    const usages: (BucketUsageResponse | null)[] = new Array(buckets.length).fill(null)
    await mapLimit([...buckets.keys()], 4, async (index) => {
      const bucket = buckets[index]
      if (!current()) return
      usages[index] = await getBucketUsage(bucket.bucket, isLocal(bucket.node_id) ? null : bucket.node_id).catch(() => null)
    })
    const sum = usages.reduce(addUsage, emptySum())
    return { groupId, name, ...sum, error: null, missing: !listing.complete, copies: hits.length }
  }

  /** Reads the groups again; without `fresh`, groups already read or being read are kept. */
  async function load(fresh = false) {
    const asked = `${sessionEpoch.value}|${myGroups.value.map((group) => group.id).join(',')}`
    if (asked === account && (loading.value || !fresh)) {
      again ||= fresh && loading.value
      return
    }
    account = asked
    const run = ++runs
    const epoch = sessionEpoch.value
    const current = () => run === runs && epoch === sessionEpoch.value
    loading.value = true
    try {
      const found = await Promise.all(myGroups.value.map((group) => readGroup(group.id, group.name, current)))
      if (current()) groups.value = found.sort((a, b) => a.name.localeCompare(b.name))
    } finally {
      if (run === runs) {
        loading.value = false
        if (again) {
          again = false
          void load(true)
        }
      }
    }
  }

  const total = computed(() => groups.value.reduce<UsageSum>(addSums, emptySum()))
  // Every group listed whole: then the listed buckets are all the group totals count.
  const listedAll = computed(() => groups.value.length > 0 && groups.value.every((group) => !group.error && !group.missing))
  const copies = computed(() => groups.value.reduce((sum, group) => sum + group.copies, 0))
  return { groups, total, listedAll, copies, loading, load }
}
