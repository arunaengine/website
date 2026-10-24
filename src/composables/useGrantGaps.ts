// Node-specific grants on buckets stored on more nodes. A read that pulls from another member
// is checked on that member, so a grant that misses a member breaks it. The connected node
// names the members of its own bucket; any other bucket stays unchecked.
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import type { DistributedResponse } from '@/lib/api'
import { grantGap } from '@/lib/distributedMock'
import { grantTargets } from '@/lib/distribution'

export interface GrantGap {
  bucket: string
  missing: string[]
  glob: string
}

const MAX_BUCKETS = 8

export function useGrantGaps(suffixes: Ref<string[]>) {
  const { getBucketDistribution, sessionEpoch } = useAruna()
  const gaps = ref<GrantGap[]>([])
  const known = new Map<string, Promise<DistributedResponse | null>>()
  let runs = 0

  function statusOf(bucket: string): Promise<DistributedResponse | null> {
    const key = `${sessionEpoch.value}/${bucket}`
    const found = known.get(key)
    if (found) return found
    const asked = getBucketDistribution(bucket).catch(() => null)
    known.set(key, asked)
    return asked
  }

  watch(
    suffixes,
    async (list) => {
      const run = ++runs
      const named = [...grantTargets(list)].slice(0, MAX_BUCKETS)
      const found = await Promise.all(
        named.map(async ([bucket, nodes]): Promise<GrantGap | null> => {
          const status = await statusOf(bucket)
          if (!status) return null
          const missing = grantGap(nodes, status.members.map((member) => member.node_id))
          return missing.length ? { bucket, missing, glob: status.recommended_grant } : null
        }),
      )
      if (run === runs) gaps.value = found.filter((gap): gap is GrantGap => gap !== null)
    },
    { immediate: true, deep: true },
  )

  return { gaps }
}
