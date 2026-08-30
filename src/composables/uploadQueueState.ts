import { ref } from 'vue'
import type { S3SessionReference } from './s3/session'

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
  // Group backing the temporary session at enqueue time. It remains fixed
  // when the user opens another group or node.
  groupId: string | null
  // Node hosting the target bucket; null = the connected node.
  nodeId: string | null
  // The target key already existed in the caller's listing at enqueue time,
  // so completing this upload overwrites an existing object.
  overwrite: boolean
  // Exact node/group/session attribution at enqueue time. Refresh rotates the
  // secret and token under the same access key, so new parts use the refreshed
  // material while already signed requests finish with their original values.
  session: S3SessionReference | null
  pausedForSession?: boolean
}

export const uploadQueueItems = ref<UploadQueueItem[]>([])
