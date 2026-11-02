// A short look into a stored text file for a chat card: the first lines of the
// first bytes read, highlighted by format. Binary and unknown formats get none.
import { classifyObject, prettyJson } from '@/composables/useObjectPreview'
import { firstLines } from './textLines'

export { PREVIEW_LINES, firstLines } from './textLines'

/** How many bytes the card reads from the start of an object. */
export const PREVIEW_BYTES = 16 * 1024

export interface ContentPreview {
  kind: 'text' | 'markdown' | 'table'
  language: string
  text: string
  /** True when the file holds more than the preview shows. */
  truncated: boolean
}

/** The preview format of a file, or null when it is not text worth showing. */
export function previewFormat(name: string, contentType?: string): Pick<ContentPreview, 'kind' | 'language'> | null {
  const { kind, language } = classifyObject({ key: name, contentType })
  if (kind === 'markdown') return { kind, language: 'markdown' }
  if (kind === 'table') return { kind, language: name.toLowerCase().endsWith('.tsv') ? 'tsv' : 'csv' }
  return kind === 'text' ? { kind, language: language ?? 'text' } : null
}

/** True for bytes no text format holds: a NUL byte or many control characters. */
export function looksBinary(bytes: Uint8Array): boolean {
  let control = 0
  for (const byte of bytes) {
    if (byte === 0) return true
    if (byte < 9 || (byte > 13 && byte < 32)) control++
  }
  return control > bytes.length / 20
}

/** The text of bytes read from the start of a file; a cut read drops its last partial character and line. */
export function decodeStart(bytes: Uint8Array, complete: boolean): string {
  const text = new TextDecoder().decode(bytes, { stream: !complete })
  return !complete && text.includes('\n') ? text.slice(0, text.lastIndexOf('\n')) : text
}

/** The bytes of a response up to `limit`; the rest of the body is never downloaded. */
export async function readStart(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(await response.arrayBuffer()).slice(0, limit)
  const bytes = new Uint8Array(limit)
  let length = 0
  while (length < limit) {
    const { done, value } = await reader.read()
    if (done) break
    const part = value.subarray(0, limit - length)
    bytes.set(part, length)
    length += part.length
  }
  void reader.cancel().catch(() => undefined)
  return bytes.slice(0, length)
}

/**
 * The preview of bytes read from the start of a file. `complete` says the read
 * reached the end; only then is JSON parsed and formatted.
 */
export function contentPreview(
  bytes: Uint8Array,
  complete: boolean,
  name: string,
  contentType?: string,
): ContentPreview | null {
  const format = previewFormat(name, contentType)
  if (!format || !bytes.length || looksBinary(bytes)) return null
  let text = decodeStart(bytes, complete)
  if (complete && format.language === 'json') text = prettyJson(text).trimEnd()
  const shown = firstLines(text)
  return { ...format, text: shown.text, truncated: shown.cut || !complete }
}
