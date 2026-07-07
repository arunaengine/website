import { computed, ref } from 'vue'
import { useS3, s3ErrorMessage, isS3QuotaError, type UploadHandle } from './useS3'

export type UploadItemState = 'queued' | 'uploading' | 'done' | 'error' | 'canceled'

export interface UploadQueueItem {
  id: number
  bucket: string
  key: string
  name: string
  size: number
  state: UploadItemState
  progress: number // 0-100
  error?: string
  quotaExceeded?: boolean
  // Group backing the credential at enqueue time — keeps the "View group
  // quota" link working after navigation. Null for manual keys.
  groupId: string | null
}

export interface UploadTarget {
  bucket: string
  prefix: string
  groupId: string | null
}

const s3 = useS3()

// Module-singleton (same convention as useAruna/useNotifications): module-scope
// state, side effects guarded by `typeof window`, intentionally never disposed
// so uploads survive navigation between views.
const items = ref<UploadQueueItem[]>([])
// Non-reactive: the File is retained for retry (a consumed Upload cannot be
// restarted) but must never become part of the reactive graph.
const files = new Map<number, File>()
const handles = new Map<number, UploadHandle>()
let counter = 0

// Bounded concurrency of whole files; each file additionally parallelizes 3
// parts internally (useS3's queueSize), so the worst case is 3×3 in-flight
// part PUTs — the browser's per-host connection pool serializes the rest.
const MAX_CONCURRENT_FILES = 3

const lastCompleted = ref<{ bucket: string; key: string; at: number } | null>(null)

const hasActiveUploads = computed(() =>
  items.value.some((item) => item.state === 'queued' || item.state === 'uploading'),
)

// Item fields are mutated in place (progress, state); re-assign the array to
// trigger reactivity for the render.
function touch() {
  items.value = [...items.value]
}

function enqueue(list: File[], target: UploadTarget): void {
  for (const file of list) {
    const item: UploadQueueItem = {
      id: ++counter,
      bucket: target.bucket,
      key: `${target.prefix}${file.name}`,
      name: file.name,
      size: file.size,
      state: 'queued',
      progress: 0,
      groupId: target.groupId,
    }
    files.set(item.id, file)
    items.value.push(item)
  }
  touch()
  pump()
}

function pump(): void {
  while (items.value.filter((item) => item.state === 'uploading').length < MAX_CONCURRENT_FILES) {
    const next = items.value.find((item) => item.state === 'queued')
    if (!next) return
    void run(next)
  }
}

async function run(item: UploadQueueItem): Promise<void> {
  const file = files.get(item.id)
  if (!file) {
    item.state = 'error'
    item.error = 'File no longer available for upload.'
    touch()
    return
  }
  item.state = 'uploading'
  item.progress = 0
  touch()
  try {
    const handle = s3.uploadObject(item.bucket, item.key, file, (loaded, total) => {
      item.progress = total ? Math.round((loaded / total) * 100) : 0
      touch()
    })
    handles.set(item.id, handle)
    await handle.promise
    if (item.state === 'uploading') {
      item.state = 'done'
      item.progress = 100
      files.delete(item.id) // free the blob; done items are not retryable
      lastCompleted.value = { bucket: item.bucket, key: item.key, at: Date.now() }
    }
  } catch (err) {
    // cancel() may have flipped the state to 'canceled' during the await, which
    // TS's synchronous control-flow analysis cannot see — widen before compare.
    if ((item.state as UploadItemState) !== 'canceled') {
      item.state = 'error'
      if (isS3QuotaError(err)) {
        item.quotaExceeded = true
        item.error = 'The group’s storage quota is exhausted — the node rejected this upload (QuotaExceeded).'
      } else {
        item.error = s3ErrorMessage(err)
      }
    }
  } finally {
    handles.delete(item.id)
    touch()
    pump()
  }
}

async function cancel(item: UploadQueueItem): Promise<void> {
  if (item.state === 'queued') {
    // Never started: just mark canceled; the File is kept for retry.
    item.state = 'canceled'
    touch()
    return
  }
  if (item.state !== 'uploading') return
  item.state = 'canceled'
  touch()
  // abort() rejects handle.promise; run()'s catch sees 'canceled' and leaves the
  // state alone, and AbortMultipartUpload cleans up the parts already written.
  await handles.get(item.id)?.abort().catch(() => undefined)
}

function retry(item: UploadQueueItem): void {
  if (item.state !== 'error' && item.state !== 'canceled') return
  if (!files.has(item.id)) return
  item.progress = 0
  item.error = undefined
  item.quotaExceeded = undefined
  item.state = 'queued'
  touch()
  pump()
}

function clearFinished(): void {
  for (const item of items.value) {
    if (item.state !== 'queued' && item.state !== 'uploading') files.delete(item.id)
  }
  items.value = items.value.filter((item) => item.state === 'queued' || item.state === 'uploading')
}

// The beforeunload guard lives at module scope so it survives navigation while
// a background upload is still running (the old view-local guard detached on
// route change). A reload silently drops the multipart upload.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (hasActiveUploads.value) event.preventDefault()
  })
}

export function useUploadQueue() {
  return { items, hasActiveUploads, lastCompleted, enqueue, cancel, retry, clearFinished }
}
