// One trailing timer: work that must not run on every keystroke or every
// output line, but must not be lost either.

export interface Trailing {
  /** Asks for a run; the first one happens after the delay. */
  schedule: () => void
  /** Runs a pending call now, for example before a page unmounts. */
  flush: () => void
  cancel: () => void
}

export function trailing(task: () => void, ms: number): Trailing {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  const fire = () => {
    timer = null
    if (!pending) return
    pending = false
    task()
  }
  return {
    schedule() {
      pending = true
      if (timer === null) timer = setTimeout(fire, ms)
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (!pending) return
      pending = false
      task()
    },
    cancel() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      pending = false
    },
  }
}
