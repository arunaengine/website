// Picks how one nbformat output is shown. Richer types win over plain text,
// the way a notebook viewer picks a representation.
import type { NotebookOutput } from './nbformat'

export type OutputRender =
  | { kind: 'stream'; name: string; text: string }
  | { kind: 'error'; ename: string; evalue: string; traceback: string[] }
  | { kind: 'html'; text: string }
  | { kind: 'svg'; text: string }
  | { kind: 'image'; mime: string; dataUrl: string }
  | { kind: 'markdown'; text: string }
  | { kind: 'json'; text: string }
  | { kind: 'text'; text: string }

// Highest first, as a notebook viewer ranks them.
const MIME_ORDER = [
  'text/html',
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'text/markdown',
  'application/json',
  'text/plain',
]

/** nbformat values are a string or a list of lines. */
function value(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw.map((line) => (typeof line === 'string' ? line : '')).join('')
  return ''
}

function fromData(data: Record<string, unknown>): OutputRender {
  const mime = MIME_ORDER.find((candidate) => data[candidate] !== undefined)
  if (!mime) {
    const first = Object.keys(data)[0]
    return { kind: 'text', text: first ? value(data[first]) : '' }
  }
  if (mime === 'text/html') return { kind: 'html', text: value(data[mime]) }
  if (mime === 'image/svg+xml') return { kind: 'svg', text: value(data[mime]) }
  if (mime === 'image/png' || mime === 'image/jpeg') {
    // Binary mimes arrive base64 encoded, as nbformat stores them.
    return { kind: 'image', mime, dataUrl: `data:${mime};base64,${value(data[mime]).replace(/\s+/g, '')}` }
  }
  if (mime === 'text/markdown') return { kind: 'markdown', text: value(data[mime]) }
  if (mime === 'application/json') {
    const raw = data[mime]
    const text = typeof raw === 'string' || Array.isArray(raw) ? value(raw) : JSON.stringify(raw, null, 2)
    return { kind: 'json', text }
  }
  return { kind: 'text', text: value(data[mime]) }
}

export function renderOutput(output: NotebookOutput): OutputRender {
  if (output.output_type === 'stream') {
    return { kind: 'stream', name: output.name, text: output.text }
  }
  if (output.output_type === 'error') {
    return { kind: 'error', ename: output.ename, evalue: output.evalue, traceback: output.traceback }
  }
  return fromData(output.data)
}

// Strips the ANSI colour codes a traceback carries, so it reads as plain text.
export function plainTraceback(traceback: string[]): string {
  return traceback.join('\n').replace(/\u001b\[[0-9;]*m/g, '')
}
