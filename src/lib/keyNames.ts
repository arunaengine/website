// Names the owner gave their access keys. The node stores no name for a key, so
// the name lives in this app only; it is never a secret and never leaves it.
const STORE = 'aruna:desktop:key-names'

function read(): Record<string, string> {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(STORE) ?? '{}') as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function keyNames(): Record<string, string> {
  return read()
}

export function rememberKeyName(accessKeyId: string, name: string): void {
  try {
    globalThis.localStorage?.setItem(STORE, JSON.stringify({ ...read(), [accessKeyId]: name }))
  } catch {
    // A name that cannot be kept only costs the label; the key still works.
  }
}
