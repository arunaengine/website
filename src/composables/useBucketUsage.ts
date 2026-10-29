// What one bucket holds, asked of the node that serves it: its file count and size. An unread
// usage stays null, so the view shows nothing instead of a zero.
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import type { BucketUsageResponse } from '@/lib/api'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'

/** "16 files, 50.2 MB", or "68,231 files referenced" when the bytes are held elsewhere. */
export function usageText(usage: BucketUsageResponse, stored = false): string {
  const files = `${usage.complete ? '' : 'at least '}${formatCount(usage.objects)} ${usage.objects === 1 ? 'file' : 'files'}`
  const referenced = usage.referenced_bytes ?? 0
  if (usage.objects && referenced && referenced >= usage.logical_bytes) return `${files} referenced`
  return `${files}, ${formatBytes(usage.logical_bytes)}${stored ? ' stored' : ''}`
}

export function useBucketUsage(bucket: Ref<string>, nodeId: Ref<string | null>) {
  const { getBucketUsage, sessionEpoch } = useAruna()
  const usage = ref<BucketUsageResponse | null>(null)
  let round = 0
  watch(
    [bucket, nodeId, sessionEpoch],
    async () => {
      const mine = ++round
      usage.value = null
      if (!bucket.value) return
      const answer = await getBucketUsage(bucket.value, nodeId.value).catch(() => null)
      if (mine === round) usage.value = answer
    },
    { immediate: true },
  )
  return usage
}
