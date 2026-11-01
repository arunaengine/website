// What one bucket holds, asked of the node that serves it: its file count and size. An unread
// usage stays null, so the view shows nothing instead of a zero.
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { lastUpload } from '@/composables/uploadQueueState'
import type { BucketUsageResponse } from '@/lib/api'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'

/** "16 files, 50.2 MB stored" or "68,231 files, 38.6 TB referenced"; both sizes when neither is 0. */
export function usageText(usage: BucketUsageResponse): string {
  const files = `${usage.complete ? '' : 'at least '}${formatCount(usage.objects)}\u00a0${usage.objects === 1 ? 'file' : 'files'}`
  // An older node names no referenced bytes, so none are shown rather than a zero.
  const referenced = usage.referenced_bytes ?? 0
  const sizes = [
    ...(usage.logical_bytes || !referenced ? [`${formatBytes(usage.logical_bytes)} stored`] : []),
    ...(referenced ? [`${formatBytes(referenced)} referenced`] : []),
  ]
  return [files, ...sizes].join(', ')
}

/** File count, stored and referenced size of one bucket; a size that is 0 is left out. */
export interface UsageParts {
  files: string
  stored: string | null
  referenced: string | null
}

export function usageParts(usage: BucketUsageResponse): UsageParts {
  const referenced = usage.referenced_bytes ?? 0
  return {
    files: `${usage.complete ? '' : '≥\u00a0'}${formatCount(usage.objects)}`,
    stored: usage.logical_bytes || !referenced ? formatBytes(usage.logical_bytes) : null,
    referenced: referenced ? formatBytes(referenced) : null,
  }
}

export function useBucketUsage(bucket: Ref<string>, nodeId: Ref<string | null>) {
  const { getBucketUsage, sessionEpoch } = useAruna()
  const usage = ref<BucketUsageResponse | null>(null)
  let round = 0
  async function read() {
    const mine = ++round
    if (!bucket.value) return
    const answer = await getBucketUsage(bucket.value, nodeId.value).catch(() => null)
    if (mine === round) usage.value = answer ?? usage.value
  }
  watch(
    [bucket, nodeId, sessionEpoch],
    () => {
      usage.value = null
      void read()
    },
    { immediate: true },
  )
  // An upload into this bucket changes its count; the shown count stays until the new one arrives.
  watch(lastUpload, (done) => {
    if (done?.bucket === bucket.value && done.nodeId === nodeId.value) void read()
  })
  return usage
}

// The usage of listed buckets, read four at a time and kept for the session, so paging back and
// forth asks each bucket once. A node is null for the connected node.
const listed = ref(new Map<string, BucketUsageResponse | null>())
const pending = new Set<string>()
const queue: { key: string; bucket: string; nodeId: string | null }[] = []
let running = 0
let listedEpoch: number | null = null
const listedKey = (bucket: string, nodeId: string | null) => `${nodeId ?? ''}/${bucket}`

export function useListedUsage() {
  const { getBucketUsage, sessionEpoch } = useAruna()

  function pump() {
    while (running < 4 && queue.length) {
      const next = queue.shift()!
      const epoch = listedEpoch
      running++
      void getBucketUsage(next.bucket, next.nodeId)
        .catch(() => null)
        .then((answer) => {
          running--
          pending.delete(next.key)
          if (epoch === listedEpoch) listed.value = new Map(listed.value).set(next.key, answer)
          pump()
        })
    }
  }

  // A finished upload drops its bucket's count, so the next ensure reads it again.
  watch(lastUpload, (done) => {
    if (!done) return
    const key = listedKey(done.bucket, done.nodeId)
    if (!listed.value.has(key) || pending.has(key)) return
    pending.add(key)
    queue.push({ key, bucket: done.bucket, nodeId: done.nodeId })
    pump()
  })

  function ensure(entries: { bucket: string; nodeId: string | null }[]) {
    if (listedEpoch !== sessionEpoch.value) {
      listedEpoch = sessionEpoch.value
      listed.value = new Map()
      pending.clear()
      queue.length = 0
    }
    for (const { bucket, nodeId } of entries) {
      const key = listedKey(bucket, nodeId)
      if (listed.value.has(key) || pending.has(key)) continue
      pending.add(key)
      queue.push({ key, bucket, nodeId })
    }
    pump()
  }

  function textOf(bucket: string, nodeId: string | null): string | null {
    const usage = listed.value.get(listedKey(bucket, nodeId))
    return usage ? usageText(usage) : null
  }

  function partsOf(bucket: string, nodeId: string | null): UsageParts | null {
    const usage = listed.value.get(listedKey(bucket, nodeId))
    return usage ? usageParts(usage) : null
  }

  // Whether the bucket reads files in place at their source; null while unknown.
  function referencedOf(bucket: string, nodeId: string | null): boolean | null {
    const usage = listed.value.get(listedKey(bucket, nodeId))
    return usage ? (usage.referenced_bytes ?? 0) > 0 : null
  }

  // The row's node answered, or failed to; false while its read is still waiting.
  const answered = (bucket: string, nodeId: string | null) => listed.value.has(listedKey(bucket, nodeId))

  return { ensure, textOf, partsOf, referencedOf, answered }
}
