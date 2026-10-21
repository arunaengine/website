// Requests with an empty token wait here while a stored token is being restored. Each restore has
// its own gate, so the late end of an abandoned restore never releases the requests of a newer one.
export interface RestoreGate {
  promise: Promise<void>
  resolve: () => void
}

let current: RestoreGate | null = null

export function openGate(): RestoreGate {
  let resolve = () => {}
  const promise = new Promise<void>((done) => (resolve = done))
  current = { promise, resolve }
  return current
}

/** Releases one gate; it leaves a newer gate alone. Without an argument, the current one. */
export function closeGate(gate: RestoreGate | null = current) {
  if (!gate) return
  gate.resolve()
  if (current === gate) current = null
}

export function pendingGate(): Promise<void> | null {
  return current?.promise ?? null
}
