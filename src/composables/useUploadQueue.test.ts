import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { nextTick, ref } from 'vue'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { S3SessionReference, UploadHandle } from './useS3'

const sessionRevision = ref(0)
const references = new Map<string, S3SessionReference>()
const expired = new Set<string>()
const uploadObject = vi.fn()

function contextKey(nodeId: string | null, groupId: string): string {
  return `${nodeId ?? 'local'}|${groupId}`
}

function referenceKey(reference: S3SessionReference): string {
  return `${reference.nodeId}|${reference.groupId}|${reference.accessKeyId}`
}

let queue: ReturnType<typeof import('./useUploadQueue').useUploadQueue>

beforeAll(async () => {
  vi.doMock('./useS3', () => ({
    useS3: () => ({
      sessionRevision,
      referenceForContext: (nodeId: string | null, groupId: string) =>
        references.get(contextKey(nodeId, groupId)) ?? null,
      sessionState: (reference: S3SessionReference) =>
        expired.has(referenceKey(reference)) ? 'expired' : 'usable',
      uploadObject,
    }),
    s3ErrorMessage: (error: unknown) => String(error),
    isS3QuotaError: () => false,
  }))
  queue = (await import('./useUploadQueue')).useUploadQueue()
})

afterAll(() => {
  vi.doUnmock('./useS3')
})

function file(name: string): File {
  return { name, size: 10, type: 'text/plain' } as File
}

function deferredHandle(): {
  handle: UploadHandle
  resolve: () => void
  reject: (error: unknown) => void
} {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { handle: { promise, abort: vi.fn(async () => undefined) }, resolve, reject }
}

describe('upload queue session attribution', () => {
  it('keeps old context attribution, pauses on expiry, and resumes only after that context is reminted', async () => {
    const sessionA: S3SessionReference = {
      nodeId: 'node-a',
      groupId: 'group-a',
      accessKeyId: 'session-a',
    }
    const sessionB: S3SessionReference = {
      nodeId: 'node-b',
      groupId: 'group-b',
      accessKeyId: 'session-b',
    }
    references.set(contextKey(null, 'group-a'), sessionA)
    references.set(contextKey('node-b', 'group-b'), sessionB)
    const handles = Array.from({ length: 4 }, deferredHandle)
    uploadObject.mockReset()
    for (const entry of handles) uploadObject.mockReturnValueOnce(entry.handle)

    queue.enqueue([file('one'), file('two'), file('three'), file('four')], {
      bucket: 'bucket-a',
      prefix: '',
      groupId: 'group-a',
      nodeId: null,
    })

    expect(uploadObject).toHaveBeenCalledTimes(3)
    const fourth = queue.items.value.find((item) => item.name === 'four')
    expect(fourth).toMatchObject({ state: 'queued', session: sessionA })

    // Opening another context does not rewrite queued attribution.
    sessionRevision.value++
    await nextTick()
    expect(fourth?.session).toEqual(sessionA)

    // Rotation keeps the access key, so in-flight work is not restarted.
    sessionRevision.value++
    await nextTick()
    expect(uploadObject).toHaveBeenCalledTimes(3)

    expired.add(referenceKey(sessionA))
    handles[0]!.resolve()
    await vi.waitFor(() => expect(fourth?.pausedForSession).toBe(true))
    expect(fourth).toMatchObject({
      state: 'error',
      session: sessionA,
      error: expect.stringContaining('Upload paused: The S3 session expired'),
    })

    const remintedA: S3SessionReference = {
      nodeId: 'node-a',
      groupId: 'group-a',
      accessKeyId: 'session-a-new',
    }
    references.set(contextKey(null, 'group-a'), remintedA)
    expired.delete(referenceKey(sessionA))
    sessionRevision.value++
    await vi.waitFor(() => expect(uploadObject).toHaveBeenCalledTimes(4))

    expect(uploadObject.mock.calls[3]?.[5]).toEqual(remintedA)
    expect(fourth?.session).toEqual(remintedA)
    expect(fourth?.state).toBe('uploading')

    for (const entry of handles.slice(1)) entry.resolve()
    await nextTick()
  })

  it('presents a session pause separately from a destructive upload error', () => {
    const panel = readFileSync(
      fileURLToPath(new URL('../components/data/TransfersPanel.vue', import.meta.url)),
      'utf8',
    )
    expect(panel).toContain("if (item.pausedForSession) return 'warn'")
    expect(panel).toContain("item.pausedForSession ? 'PAUSED' : item.state")
    expect(panel).toContain("item.pausedForSession ? 'text-amber-700 dark:text-amber-400' : 'text-destructive'")
    expect(panel).toContain("item.state === 'error' || item.state === 'canceled'")
  })
})

describe('upload queue completion status', () => {
  const sessionC: S3SessionReference = {
    nodeId: 'node-c',
    groupId: 'group-c',
    accessKeyId: 'session-c',
  }

  function start(name: string) {
    references.set(contextKey('node-c', 'group-c'), sessionC)
    const deferred = deferredHandle()
    uploadObject.mockReset()
    uploadObject.mockReturnValueOnce(deferred.handle)
    queue.enqueue([file(name)], {
      bucket: 'bucket-c',
      prefix: '',
      groupId: 'group-c',
      nodeId: 'node-c',
    })
    const item = queue.items.value.find((entry) => entry.name === name)!
    return { item, ...deferred }
  }

  function retryReporter(): (attempt: number, error: unknown) => void {
    return uploadObject.mock.calls[0]?.[6] as (attempt: number, error: unknown) => void
  }

  it('names the completion attempt while the node finishes the object', async () => {
    const { item, resolve } = start('completing')
    await vi.waitFor(() => expect(item.state).toBe('uploading'))

    retryReporter()(2, new Error('connection reset'))

    expect(item.state).toBe('uploading')
    expect(item.error).toBe('Finishing the upload, attempt 2… Error: connection reset')

    resolve()
    await vi.waitFor(() => expect(item.state).toBe('done'))
    expect(item.error).toBeUndefined()
  })

  it('replaces the attempt line with the reason the upload failed', async () => {
    const { item, reject } = start('exhausted')
    await vi.waitFor(() => expect(item.state).toBe('uploading'))

    retryReporter()(3, new Error('connection reset'))
    reject(new Error('NoSuchUpload'))

    await vi.waitFor(() => expect(item.state).toBe('error'))
    expect(item.error).toBe('Error: NoSuchUpload')
  })

  it('aborts the multipart upload when a completing item is canceled', async () => {
    const { item, handle, reject } = start('canceled')
    await vi.waitFor(() => expect(item.state).toBe('uploading'))
    retryReporter()(2, new Error('connection reset'))

    await queue.cancel(item)

    expect(handle.abort).toHaveBeenCalledTimes(1)
    expect(item.state).toBe('canceled')
    expect(item.error).toBeUndefined()
    reject(new Error('Upload aborted.'))
    await vi.waitFor(() => expect(item.state).toBe('canceled'))
  })
})
