// Buckets of one group on the connected node that a new S3 key may get a session
// token for: every encrypted one. An answer for another group, session or later
// request is dropped.
import { ref, watch, type Ref } from 'vue'
import { ApiError, getBucketEncryption, listGroupDataPaths } from '@/lib/api'
import { tokenEligible } from '@/lib/bucketEncryption'
import { errorMessage } from '@/lib/utils'
import { apiBaseUrl, refreshContext, sessionEpoch } from './aruna/state'

export type TokenBucketsState = 'idle' | 'loading' | 'ready' | 'refused' | 'failed'

const PAGE_SIZE = 1000
const BATCH_SIZE = 6

function bucketName(permissionPath: string): string {
  return permissionPath.replace(/\/+$/, '').split('/').pop() ?? ''
}

export function useTokenBuckets(groupId: Ref<string>, active: Ref<boolean>) {
  const buckets = ref<string[]>([])
  const state = ref<TokenBucketsState>('idle')
  const error = ref<string | null>(null)
  /** Buckets whose encryption state was not reported; they are not offered. */
  const unchecked = ref(0)
  /** The group has more buckets than one page, and only the first page was checked. */
  const partial = ref(false)
  let run = 0

  async function load(group: string) {
    const current = run
    const { client, epoch } = refreshContext()
    const live = () => current === run && epoch === sessionEpoch.value
    try {
      const page = await listGroupDataPaths(group, { delimiter: '/', limit: PAGE_SIZE }, client)
      if (!live()) return
      const names = page.entries
        .filter((entry) => entry.kind === 'folder')
        .map((entry) => bucketName(entry.permission_path))
      const offered: string[] = []
      let failed = 0
      for (let start = 0; start < names.length; start += BATCH_SIZE) {
        const batch = names.slice(start, start + BATCH_SIZE)
        const answers = await Promise.allSettled(batch.map((name) => getBucketEncryption(name, client)))
        if (!live()) return
        answers.forEach((answer, index) => {
          if (answer.status === 'rejected') failed += 1
          else if (tokenEligible(answer.value)) offered.push(batch[index])
        })
      }
      buckets.value = offered
      unchecked.value = failed
      partial.value = Boolean(page.continuation_token)
      state.value = 'ready'
    } catch (cause) {
      if (!live()) return
      const refused = cause instanceof ApiError && (cause.status === 401 || cause.status === 403)
      state.value = refused ? 'refused' : 'failed'
      error.value = errorMessage(cause)
    }
  }

  watch(
    [groupId, active, sessionEpoch, apiBaseUrl],
    ([group, on, epoch, base], previous) => {
      run += 1
      const sameContext = group === previous[0] && epoch === previous[2] && base === previous[3]
      if (sameContext && (!on || state.value === 'ready')) return
      buckets.value = []
      unchecked.value = 0
      partial.value = false
      error.value = null
      state.value = on && group ? 'loading' : 'idle'
      if (on && group) void load(group)
    },
    { immediate: true },
  )

  return { buckets, state, error, unchecked, partial }
}
