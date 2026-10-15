import { ref, watch, type Ref } from 'vue'
import { getBucketCheck, type BrokenReason } from '@/lib/api'
import { apiBaseUrl, authToken } from './aruna/state'
import { nodeApiBase } from './s3/endpoints'

const PAGE = 500

const WORDS: Record<BrokenReason, string> = {
  missing_blob: 'File missing on storage',
  storage_removed: 'Storage removed',
  missing_record: 'Record missing',
}

/** The broken files the last check found in the open bucket; empty if the node cannot say. */
/** `listed` changes whenever the file list is read again, so the marks follow it. */
export function useBrokenFiles(bucket: Ref<string>, nodeId: Ref<string | null>, listed?: Ref<unknown>) {
  const reasons = ref<Record<string, BrokenReason>>({})
  let seq = 0

  async function load() {
    const run = ++seq
    const baseUrl = nodeId.value ? nodeApiBase(nodeId.value) : apiBaseUrl.value
    if (!bucket.value || !baseUrl || !authToken.value) {
      reasons.value = {}
      return
    }
    const found: Record<string, BrokenReason> = {}
    try {
      let after: string | undefined
      do {
        const answer = await getBucketCheck(bucket.value, { after, limit: PAGE }, { baseUrl, token: authToken.value })
        if (run !== seq) return
        for (const file of answer.broken) found[file.key] ??= file.reason
        after = answer.next ?? undefined
      } while (after)
    } catch {
      // A node without the check, or a reader it refuses, shows nothing.
    }
    if (run === seq) reasons.value = found
  }

  // Another bucket or node never keeps the marks of the previous one.
  watch([bucket, nodeId], () => (reasons.value = {}), { flush: 'sync' })
  watch([bucket, nodeId, authToken, () => listed?.value], load, { immediate: true })

  return { reasonOf: (key: string): string | null => (reasons.value[key] ? WORDS[reasons.value[key]] : null) }
}
