// Timers for the landing page animations that a view cancels together when it unmounts.

export interface Timers {
  /** Resolves after `ms`; never resolves once the timers are cleared. */
  wait(ms: number): Promise<void>
  after(ms: number, run: () => void): void
  clear(): void
}

export function createTimers(): Timers {
  const pending = new Set<ReturnType<typeof setTimeout>>()
  const after = (ms: number, run: () => void) => {
    const id = setTimeout(() => {
      pending.delete(id)
      run()
    }, ms)
    pending.add(id)
  }
  return {
    wait: (ms) => new Promise((resolve) => after(ms, resolve)),
    after,
    clear() {
      pending.forEach(clearTimeout)
      pending.clear()
    },
  }
}

/** True when the visitor asked for less motion; false outside a browser. */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** True on phone-sized screens, where some views use a narrower layout. */
export function phoneScreen(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 900px)').matches
}
