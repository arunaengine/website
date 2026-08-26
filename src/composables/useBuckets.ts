import { computed, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { isS3AuthError, s3ErrorMessage, useS3, type BucketEntry } from '@/composables/useS3'
import { createSwrCache } from '@/lib/swr'

// Module singleton: the bucket list outlives the Data view, so switching tabs
// and coming back paints the previous list at once instead of an empty sidebar
// behind a spinner. Revalidation happens in the background.

const { sessionEpoch } = useAruna()
const s3 = useS3()

// Buckets only appear or vanish when someone creates or deletes one, and both
// paths force a reload here; 15s keeps a tab switch free while still picking up
// buckets made elsewhere (compute workspaces, syncs) within a few seconds.
const FRESH_MS = 15_000

const cache = createSwrCache<BucketEntry[]>([], FRESH_MS)

// Identity and target of the cached list. A new session epoch (token or API
// base change), a different access key or a different endpoint all mean another
// principal or another store, so the cached list must never carry over.
const scope = computed(() => {
  const key = s3.activeKey.value
  const endpoint = s3.endpoint.value
  if (!key || !endpoint) return null
  return `${sessionEpoch.value}|${key.accessKeyId}|${endpoint}`
})

// Drop the list the moment identity changes, even with no view mounted: a
// sign-out clears the active key, which empties the scope.
watch(scope, (key) => {
  if (key === cache.scope.value) return
  // A token refresh keeps the same credentials, so nothing would call ensure()
  // again and the sidebar would stay blank until a manual Refresh. Refill only
  // a list that was already in use: a signed-out or never-opened view waits.
  const wasInUse = cache.scope.value !== null
  cache.reset()
  if (key && wasInUse) void ensure()
})

function onFailure(err: unknown) {
  // Rejected credentials are not transient (every follow-up call fails the
  // same way), so the list is dropped and the recovery panel takes over. Any
  // other failure keeps the last good list and reports itself next to it.
  return { message: s3ErrorMessage(err), discard: isS3AuthError(err) }
}

/** Paints the cached list and revalidates only when it is past the freshness window. */
async function ensure(): Promise<void> {
  const key = scope.value
  if (!key) return
  await cache.revalidate(key, () => s3.listBuckets(), onFailure)
}

/** Unconditional reload, for an explicit Refresh or right after a create/delete. */
async function refresh(): Promise<void> {
  const key = scope.value
  if (!key) return
  await cache.revalidate(key, () => s3.listBuckets(), onFailure, true)
}

export function useBuckets() {
  return {
    buckets: cache.data,
    loaded: cache.loaded,
    loading: cache.loading,
    refreshing: cache.refreshing,
    error: computed(() => cache.error.value?.message ?? null),
    // Discarding the cached list is reserved for credential rejections.
    authError: computed(() => cache.error.value?.discard === true),
    ensure,
    refresh,
  }
}
