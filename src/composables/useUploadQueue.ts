import { computed, ref, watch } from 'vue'
import {
  useS3,
  s3ErrorMessage,
  isS3QuotaError,
  type S3SessionReference,
  type UploadHandle,
} from './useS3'
import { uploadQueueItems as items, type UploadItemState, type UploadQueueItem } from './uploadQueueState'

export type { UploadItemState, UploadQueueItem } from './uploadQueueState'

export interface UploadTarget {
  bucket: string
  prefix: string
  groupId: string | null
  // Node hosting the target bucket; omitted/null = the connected node.
  nodeId?: string | null
  // Explicit object key override (single-file enqueues); defaults to
  // `${prefix}${file.name}`. Lets basket rows keep their edited target keys
  // and folder uploads their relative paths.
  key?: string
  // Marks the enqueued item as overwriting an existing object.
  overwrite?: boolean
}

const s3 = useS3()

// Module-singleton (same convention as useAruna/useNotifications): module-scope
// state, side effects guarded by `typeof window`, intentionally never disposed
// so uploads survive navigation between views.
// Non-reactive: the File is retained for retry (a consumed Upload cannot be
// restarted) but must never become part of the reactive graph.
const files = new Map<number, File>()
const handles = new Map<number, UploadHandle>()
let counter = 0

// Bounded concurrency of whole files; each file additionally parallelizes 3
// parts internally (useS3's queueSize), so the worst case is 3×3 in-flight
// part PUTs; the browser's per-host connection pool serializes the rest.
const MAX_CONCURRENT_FILES = 3

const lastCompleted = ref<{ bucket: string; key: string; nodeId: string | null; at: number } | null>(null)

function sessionOf(nodeId: string | null, groupId: string | null): S3SessionReference | null {
  return groupId ? s3.referenceForContext(nodeId, groupId) : null
}

const hasActiveUploads = computed(() =>
  items.value.some(
    (item) => item.state === 'queued' || item.state === 'uploading' || item.pausedForSession,
  ),
)

// Item fields are mutated in place (progress, state); re-assign the array to
// trigger reactivity for the render.
function touch() {
  items.value = [...items.value]
}

function enqueue(list: File[], target: UploadTarget): void {
  const nodeId = target.nodeId ?? null
  for (const file of list) {
    const item: UploadQueueItem = {
      id: ++counter,
      bucket: target.bucket,
      key: target.key ?? `${target.prefix}${file.name}`,
      name: file.name,
      size: file.size,
      state: 'queued',
      progress: 0,
      groupId: target.groupId,
      nodeId,
      overwrite: target.overwrite ?? false,
      session: sessionOf(nodeId, target.groupId),
    }
    if (!item.session) pauseForSession(item, 'No valid S3 session is available for this node and group.')
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
  if (!item.session) {
    pauseForSession(item, 'No valid S3 session is available for the queued node and group.')
    touch()
    return
  }
  const sessionState = s3.sessionState(item.session)
  if (sessionState !== 'usable') {
    pauseForSession(
      item,
      sessionState === 'expired'
        ? 'The S3 session expired before this upload started.'
        : 'The original S3 session is no longer available.',
    )
    touch()
    return
  }
  item.state = 'uploading'
  item.pausedForSession = undefined
  item.progress = 0
  touch()
  try {
    const handle = s3.uploadObject(
      item.bucket,
      item.key,
      file,
      (loaded, total) => {
        item.progress = total ? Math.round((loaded / total) * 100) : 0
        touch()
      },
      item.nodeId,
      item.session,
      (attempt, error) => {
        // The parts are on the node; only the completion is being repeated.
        item.error = `Finishing the upload, attempt ${attempt}… ${s3ErrorMessage(error)}`
        touch()
      },
    )
    handles.set(item.id, handle)
    await handle.promise
    if (item.state === 'uploading') {
      item.state = 'done'
      item.error = undefined
      item.progress = 100
      files.delete(item.id) // free the blob; done items are not retryable
      lastCompleted.value = { bucket: item.bucket, key: item.key, nodeId: item.nodeId, at: Date.now() }
    }
  } catch (err) {
    // cancel() may have flipped the state to 'canceled' during the await, which
    // TS's synchronous control-flow analysis cannot see; widen before compare.
    if ((item.state as UploadItemState) !== 'canceled') {
      if (item.session && s3.sessionState(item.session) !== 'usable') {
        pauseForSession(item, 'The S3 session expired while this upload was running.')
      } else if (isS3QuotaError(err)) {
        item.state = 'error'
        item.pausedForSession = undefined
        item.quotaExceeded = true
        item.error = 'The group’s storage quota is exhausted; the node rejected this upload (QuotaExceeded).'
      } else {
        item.state = 'error'
        item.pausedForSession = undefined
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
  if (item.state === 'queued' || item.pausedForSession) {
    // Never started: just mark canceled; the File is kept for retry.
    item.state = 'canceled'
    item.pausedForSession = undefined
    touch()
    return
  }
  if (item.state !== 'uploading') return
  item.state = 'canceled'
  item.error = undefined
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
  // Retry can only rebind to the same queued node and group. It never follows
  // the currently active context to a different target.
  item.session = sessionOf(item.nodeId, item.groupId)
  if (!item.session) {
    pauseForSession(item, 'Open the queued node and group to resume this upload.')
    touch()
    return
  }
  item.pausedForSession = undefined
  item.state = 'queued'
  touch()
  pump()
}

// Removes one finished (done/error/canceled) row, e.g. the transfers panel
// auto-clearing completed entries. Active items must be canceled first.
function dismiss(id: number): void {
  const item = items.value.find((entry) => entry.id === id)
  if (!item || item.state === 'queued' || item.state === 'uploading') return
  files.delete(id)
  items.value = items.value.filter((entry) => entry.id !== id)
}

function clearFinished(): void {
  for (const item of items.value) {
    if (item.state !== 'queued' && item.state !== 'uploading' && !item.pausedForSession) files.delete(item.id)
  }
  items.value = items.value.filter(
    (item) => item.state === 'queued' || item.state === 'uploading' || item.pausedForSession,
  )
}

function pauseForSession(item: UploadQueueItem, reason: string): void {
  item.state = 'error'
  item.pausedForSession = true
  item.error = `Upload paused: ${reason}`
}

// Opening or reminting the same node/group context resumes only files that
// were paused for that exact context. Switching elsewhere never retargets them.
watch(s3.sessionRevision, () => {
  let resumed = false
  for (const item of items.value) {
    if (!item.pausedForSession || !item.groupId) continue
    const session = sessionOf(item.nodeId, item.groupId)
    if (!session) continue
    item.session = session
    item.pausedForSession = undefined
    item.error = undefined
    item.state = 'queued'
    resumed = true
  }
  if (!resumed) return
  touch()
  pump()
})

// The beforeunload guard lives at module scope so it survives navigation while
// a background upload is still running (the old view-local guard detached on
// route change). A reload silently drops the multipart upload.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (hasActiveUploads.value) event.preventDefault()
  })
}

export function useUploadQueue() {
  return { items, hasActiveUploads, lastCompleted, enqueue, cancel, retry, dismiss, clearFinished }
}
