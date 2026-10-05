// Whether the source bucket of a copy holds encrypted versions, asked of the node
// that hosts it. Null while loading, refused or not reported; an answer for an
// older bucket, node or session is dropped.
import { ref, watch, type Ref } from 'vue'
import { getBucketEncryption } from '@/lib/api'
import { holdsEncrypted } from '@/lib/bucketEncryption'
import { authToken, sessionEpoch } from './aruna/state'

export function useEncryptedSource(bucket: Ref<string>, apiBase: Ref<string | null>, active: Ref<boolean>) {
  const encrypted = ref<boolean | null>(null)
  let run = 0

  watch(
    [bucket, apiBase, active, sessionEpoch],
    async ([name, base, on]) => {
      const current = ++run
      encrypted.value = null
      if (!on || !name || !base) return
      try {
        const status = await getBucketEncryption(name, { baseUrl: base, token: authToken.value })
        if (current === run) encrypted.value = holdsEncrypted(status)
      } catch {
        // Unknown stays null, so the choice to store a copy unencrypted stays hidden.
      }
    },
    { immediate: true },
  )

  return encrypted
}
