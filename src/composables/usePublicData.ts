// Signed out, what public roles let a visitor read: the public buckets of the realm and the files
// of one folder, listed on a node that holds the bucket and downloaded from that node's S3.
import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, type BucketSearchHit } from '@/lib/api'
import { mergeSets } from '@/lib/distribution'
import { isHiddenBucket } from '@/lib/workspaces'
import { errorMessage, isHttpUrl } from '@/lib/utils'

export interface PublicFile {
  key: string
  name: string
  size: number | null
  lastModified: string | null
  contentType: string | null
  versionId: string
}

export interface PublicFolder {
  prefix: string
  name: string
}

/** The download of a public file from the S3 endpoint of a node that holds it; null unless HTTP(S). */
export function publicDownload(s3Url: string, bucket: string, key: string): string | null {
  if (!isHttpUrl(s3Url)) return null
  return `${s3Url.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/** Every page of the signed-out bucket search, one row per distributed bucket. */
export function usePublicBuckets() {
  const { currentUser, nodeInfo, searchBuckets, sessionEpoch } = useAruna()
  const { isTarget } = useRealmNodes()
  const found = ref<BucketSearchHit[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let round = 0

  async function load() {
    const mine = ++round
    found.value = []
    error.value = null
    // A session lists its own buckets; this list is only for visitors.
    if (currentUser.value) return
    loading.value = true
    const seen = new Set<string>()
    let cursor: string | undefined
    try {
      do {
        const page = await searchBuckets('', { limit: 50, cursor })
        if (mine !== round) return
        found.value = [...found.value, ...page.hits.filter((hit) => !isHiddenBucket(hit.bucket))]
        if (cursor) seen.add(cursor)
        cursor = page.next_cursor && !seen.has(page.next_cursor) ? page.next_cursor : undefined
      } while (cursor)
    } catch (cause) {
      if (mine === round) error.value = errorMessage(cause)
    } finally {
      if (mine === round) loading.value = false
    }
  }

  watch([sessionEpoch, () => Boolean(currentUser.value)], () => void load(), { immediate: true })
  const buckets = computed(() =>
    mergeSets(found.value.filter((hit) => isTarget(hit.node_id)), (id) => id === nodeInfo.value?.node.peer_id))
  return { buckets, loading, error, reload: load }
}

/** One folder of a public bucket, a page at a time, listed on the node `nodeId` (null: this one). */
export function usePublicFolder(bucket: Ref<string>, prefix: Ref<string>, nodeId: Ref<string | null>, pageSize: Ref<number>) {
  const { listBucketObjects, sessionEpoch } = useAruna()
  const folders = ref<PublicFolder[]>([])
  const files = ref<PublicFile[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  // The node refused or does not know the bucket; signed out both answer alike.
  const denied = ref(false)
  const page = ref(1)
  // The cursor that starts each page; the first page has none.
  const cursors = ref<(string | undefined)[]>([undefined])
  const nextCursor = ref<string | null>(null)
  let round = 0

  async function load() {
    const mine = ++round
    const name = bucket.value
    const folder = prefix.value
    loading.value = true
    error.value = null
    denied.value = false
    try {
      const answer = await listBucketObjects(
        name,
        { prefix: folder || undefined, delimiter: '/', cursor: cursors.value[page.value - 1], limit: pageSize.value },
        nodeId.value,
      )
      if (mine !== round) return
      folders.value = answer.prefixes.map((entry) => ({ prefix: entry, name: entry.slice(folder.length).replace(/\/$/, '') }))
      // The folder's own empty marker object is no file of it.
      files.value = answer.objects.filter((object) => object.key !== folder).map((object) => ({
        key: object.key,
        name: object.key.slice(folder.length),
        size: object.size ?? null,
        lastModified: object.last_modified ?? null,
        contentType: object.content_type ?? null,
        versionId: object.version_id,
      }))
      nextCursor.value = answer.next_cursor ?? null
    } catch (cause) {
      if (mine !== round) return
      folders.value = []
      files.value = []
      nextCursor.value = null
      denied.value = cause instanceof ApiError && [401, 403, 404].includes(cause.status)
      error.value = errorMessage(cause)
    } finally {
      if (mine === round) loading.value = false
    }
  }

  // Another bucket, folder, node, page size or session starts at the first page again.
  watch([bucket, prefix, nodeId, pageSize, sessionEpoch], () => {
    page.value = 1
    cursors.value = [undefined]
    folders.value = []
    files.value = []
    nextCursor.value = null
    if (bucket.value) void load()
  }, { immediate: true })

  function nextPage() {
    if (!nextCursor.value || loading.value) return
    cursors.value = [...cursors.value.slice(0, page.value), nextCursor.value]
    page.value += 1
    void load()
  }

  function previousPage() {
    if (page.value <= 1 || loading.value) return
    page.value -= 1
    void load()
  }

  return { folders, files, loading, error, denied, page, nextCursor, nextPage, previousPage, reload: load }
}
