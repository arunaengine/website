// The browsed bucket while it is vault-locked and locked on its node: whether the caller holds a
// key, row downloads through that key, and issuance of waiting requests by a key holder.
import { computed, ref, watch, type Ref } from 'vue'
import { listKeyGrants } from '@/lib/api'
import { keyGenerations } from '@/lib/bucketEncryption'
import type { ObjectEntry } from './s3/objects'
import { useBucketEncryption } from './useBucketEncryption'
import { useKeyedRead } from './useKeyedRead'
import { useKeyIssue } from './useKeyIssue'
import { useUserVault } from './useUserVault'

export function useLockedBucket(
  bucket: Ref<string>,
  nodeId: Ref<string | null>,
  groupId: Ref<string | null>,
  plainDownload: (object: ObjectEntry) => unknown,
) {
  const encryption = useBucketEncryption(bucket, nodeId, groupId)
  const keyed = useKeyedRead()
  const keyIssue = useKeyIssue()
  const vaultState = useUserVault().state
  // No key of a vault-locked bucket is unlocked on the node: reads use the caller's scoped key.
  const lockedOnNode = computed(() => {
    const status = encryption.status.value
    return status?.mode === 'vault_locked' && !keyGenerations(status).list.some((key) => key.unlock.state === 'unlocked')
  })
  const availableToYou = ref(false)

  watch([lockedOnNode, encryption.revision], async () => {
    availableToYou.value = false
    const name = bucket.value
    if (!lockedOnNode.value) return
    try {
      const page = await listKeyGrants(name, null, encryption.client())
      if (name === bucket.value && lockedOnNode.value) availableToYou.value = page.records.length > 0
    } catch {
      // Unknown stays unshown.
    }
  }, { immediate: true })
  watch([() => encryption.status.value?.caller.holder, vaultState], ([holder, state]) => {
    const target = holder && state === 'unlocked' ? keyIssue.targetOf(bucket.value, encryption.nodeId.value) : null
    if (target) void keyIssue.issueWaiting([target])
  })
  watch(bucket, () => keyed.cancel())

  /** Unknown failures fall back to the plain download. */
  async function download(object: ObjectEntry) {
    if (!lockedOnNode.value) return plainDownload(object)
    try {
      await keyed.save({ bucket: bucket.value, key: object.key, nodeId: nodeId.value }, object.name)
    } catch {
      void plainDownload(object)
    }
  }

  const keyPending = (key: string) => keyed.pending.value.has(`${bucket.value}\u0000${key}`)

  return { lockedOnNode, availableToYou, wait: keyed.wait, cancel: keyed.cancel, keyPending, download }
}
