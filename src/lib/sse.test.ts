import { describe, expect, it } from 'vitest'
import { parseSseFrame, readSseFrames, type SseFrame } from './sse'

function body(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return {
    getReader: () => ({
      read: async () =>
        index < chunks.length
          ? { done: false, value: encoder.encode(chunks[index++]) }
          : { done: true, value: undefined },
    }),
  } as unknown as ReadableStream<Uint8Array>
}

describe('parseSseFrame', () => {
  it('reads id, event and joined data lines', () => {
    expect(parseSseFrame('id: 7\nevent: cell\ndata: {"a":1}\ndata: ')).toEqual({
      id: '7',
      event: 'cell',
      data: '{"a":1}\n',
    })
  })

  it('defaults the event name and ignores a keep-alive comment', () => {
    expect(parseSseFrame('data: hello')).toEqual({ id: undefined, event: 'message', data: 'hello' })
    expect(parseSseFrame(': keep-alive')).toBeNull()
  })
})

describe('readSseFrames', () => {
  it('reassembles frames split across chunks', async () => {
    const frames: SseFrame[] = []
    await readSseFrames(body(['event: state\nda', 'ta: {"a":1}\n\nevent: state\ndata: {"a":2}\n\n']), (frame) =>
      frames.push(frame),
    )
    expect(frames.map((frame) => frame.data)).toEqual(['{"a":1}', '{"a":2}'])
  })

  it('keeps a last frame the server did not terminate', async () => {
    const frames: SseFrame[] = []
    await readSseFrames(body(['event: state\ndata: {"a":1}']), (frame) => frames.push(frame))
    expect(frames).toHaveLength(1)
  })

  it('reports every read, keep-alives included', async () => {
    let chunks = 0
    await readSseFrames(body([': keep-alive\n\n', 'data: 1\n\n']), () => {}, () => {
      chunks += 1
    })
    expect(chunks).toBe(3)
  })

  it('refuses a response without a body', async () => {
    await expect(readSseFrames(null, () => {})).rejects.toThrow('no body')
  })
})
