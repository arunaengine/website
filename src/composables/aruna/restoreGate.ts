// Requests with an empty token wait here while a stored token is being restored. Each restore has
// its own gate, so the late end of an abandoned restore never releases the requests of a newer one.
// A gate that is replaced or left open too long releases its waiters, so nothing waits for ever.
export interface RestoreGate {
  promise: Promise<void>
  resolve: () => void
  /** A restore has taken this gate; the bootstrap gate waits for the first one. */
  owned: boolean
}

const LIMIT_MS = 15_000
let current: RestoreGate | null = null

function create(owned: boolean): RestoreGate {
  let finish = () => {}
  const promise = new Promise<void>((done) => (finish = done))
  const timer = setTimeout(() => closeGate(gate), LIMIT_MS)
  const gate: RestoreGate = {
    promise,
    owned,
    resolve: () => {
      clearTimeout(timer)
      finish()
    },
  }
  return gate
}

/** The gate of the page load, open before any refresh starts; the first restore takes it over. */
export function bootstrapGate(): RestoreGate {
  current ??= create(false)
  return current
}

/** The gate of one restore: the waiting bootstrap gate for the first, a new one after that. */
export function openGate(): RestoreGate {
  if (current && !current.owned) {
    current.owned = true
    return current
  }
  // A restore that is replaced frees the requests that waited for it.
  current?.resolve()
  current = create(true)
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
