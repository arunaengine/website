// The uploads of one visit, sent one after another so each shows its own progress.
import { ref } from 'vue'
import { ApiError, uploadVisitFile } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { isRangeUnavailable, isUnavailable } from './useShareVisit'

export interface VisitUpload {
  id: number
  /** Path below the shared root that was asked for. */
  name: string
  size: number
  sent: number
  state: 'waiting' | 'sending' | 'done' | 'failed'
  /** Where it landed; differs from `name` when that was taken. */
  landed?: string
  error?: string
}

type Visit = <T>(call: (token: string, base: string) => Promise<T>) => Promise<T>

/** The relative path a picked or dropped file keeps, below the folder on screen. */
export function uploadName(prefix: string, file: File): string {
  return `${prefix}${file.webkitRelativePath || file.name}`
}

function failure(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === 'name_taken') return 'Another upload took this name. Send the file again.'
  if (isRangeUnavailable(cause)) return 'This part of the folder takes no uploads right now. Try again later.'
  if (cause instanceof ApiError && cause.status === 409) return 'The storage of this group is full.'
  if (cause instanceof ApiError && cause.status === 403) return 'This link does not accept uploads here.'
  return errorMessage(cause)
}

export function useVisitUploads(visit: Visit, onLanded: () => void = () => {}) {
  const uploads = ref<VisitUpload[]>([])
  let counter = 0
  let queue: Promise<void> = Promise.resolve()

  function update(id: number, change: Partial<VisitUpload>) {
    uploads.value = uploads.value.map((entry) => (entry.id === id ? { ...entry, ...change } : entry))
  }

  async function send(id: number, file: File) {
    const entry = uploads.value.find((candidate) => candidate.id === id)
    if (!entry) return
    update(id, { state: 'sending' })
    const upload = () => visit((token, base) => uploadVisitFile(entry.name, file, token, base, (sent) => update(id, { sent })))
    try {
      // Another writer took the name during the upload; the node picks a free one on a resend.
      const landed = await upload().catch((cause) => {
        if (!(cause instanceof ApiError && cause.status === 409 && cause.code === 'name_taken')) throw cause
        update(id, { sent: 0 })
        return upload()
      })
      update(id, { state: 'done', sent: entry.size, landed: landed.name })
      onLanded()
    } catch (cause) {
      update(id, { state: 'failed', error: isUnavailable(cause) ? 'This link does not work.' : failure(cause) })
    }
  }

  function add(prefix: string, files: File[]) {
    for (const file of files) {
      const id = ++counter
      uploads.value = [...uploads.value, { id, name: uploadName(prefix, file), size: file.size, sent: 0, state: 'waiting' }]
      queue = queue.then(() => send(id, file))
    }
    return queue
  }

  return { uploads, add }
}
