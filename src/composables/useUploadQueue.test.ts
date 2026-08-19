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

function deferredHandle(): { handle: UploadHandle; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { handle: { promise, abort: vi.fn(async () => undefined) }, resolve }
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
})
