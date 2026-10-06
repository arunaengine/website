import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KeyWorkerReply } from './abe.worker'

const opened: Array<(key: unknown) => void> = []

vi.mock('./kpabe/kpabe', () => ({ default: () => Promise.resolve() }))
vi.mock('./kpabe/kpabe_bg.wasm?url', () => ({ default: '' }))
vi.mock('./abe', () => ({
  importGrant: () => new Promise((resolve) => opened.push(resolve)),
  issueGrant: vi.fn(),
  openObject: (key: string) => Promise.resolve(new TextEncoder().encode(key)),
}))

afterEach(() => vi.unstubAllGlobals())

describe('key worker', () => {
  it('returns the handle of each overlapping import when they finish in reverse order', async () => {
    const replies: KeyWorkerReply[] = []
    const scope = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: (message: KeyWorkerReply) => replies.push(message),
    }
    vi.stubGlobal('self', scope)
    await import('./abe.worker')
    const settled = async (count: number) => {
      await vi.waitFor(() => expect(replies).toHaveLength(count))
    }

    scope.onmessage?.({ data: { id: 1, op: 'import', input: {} } })
    scope.onmessage?.({ data: { id: 2, op: 'import', input: {} } })
    await vi.waitFor(() => expect(opened).toHaveLength(2))
    opened[1]('second')
    await settled(1)
    opened[0]('first')
    await settled(2)
    const handles = new Map(replies.map((reply) => [reply.id, 'value' in reply ? reply.value : reply.error]))
    expect(handles.get(1)).not.toBe(handles.get(2))

    scope.onmessage?.({ data: { id: 3, op: 'open', handle: handles.get(1), input: {} } })
    await settled(3)
    expect(replies[2]).toEqual({ id: 3, value: new TextEncoder().encode('first') })
  })
})
