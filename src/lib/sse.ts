// Server-sent events over a fetch body. EventSource cannot carry the bearer
// header, so every stream in the portal reads its frames here.

export interface SseFrame {
  id?: string
  event: string
  data: string
}

/** Parses one frame; a comment-only keep-alive answers null. */
export function parseSseFrame(frame: string): SseFrame | null {
  let event = 'message'
  let id: string | undefined
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    if (field === 'id') id = value
    if (field === 'data') data.push(value)
  }
  if (!data.length) return null
  return { id, event, data: data.join('\n') }
}

/**
 * Reads frames until the body ends. `onChunk` fires for every read, keep-alive
 * comments included, so a caller can tell a live connection from a dead one.
 */
export async function readSseFrames(
  body: ReadableStream<Uint8Array> | null,
  onFrame: (frame: SseFrame) => void,
  onChunk?: () => void,
): Promise<void> {
  const reader = body?.getReader()
  if (!reader) throw new Error('The event stream carries no body.')
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    onChunk?.()
    buffer += decoder.decode(value, { stream: !done })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const raw of frames) {
      const frame = parseSseFrame(raw)
      if (frame) onFrame(frame)
    }
    if (done) {
      // A last frame the server did not terminate still counts.
      if (buffer.trim()) {
        const frame = parseSseFrame(buffer)
        if (frame) onFrame(frame)
      }
      return
    }
  }
}
