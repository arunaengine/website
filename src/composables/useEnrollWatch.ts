// Enrollments the shell acted on, for the device page: the invitation it
// retained (a link followed into a cold start), then live events, and the
// node's own status when no event channel can be reached.
import { onUnmounted, ref } from 'vue'
import { lastEnrollInvite, nodeStatus, type EnrollInvite } from '@/lib/desktopBridge'
import { onEnrollInvite, type Unlisten } from '@/lib/desktopEvents'

const WATCH_MS = 5_000

export function useEnrollWatch() {
  const invite = ref<EnrollInvite | null>(null)

  let live = true
  let unlisten: Unlisten | null = null
  let timer: ReturnType<typeof setInterval> | undefined

  function show(next: EnrollInvite): void {
    if (live) invite.value = next
  }

  // A shell that retains none, or does not know the command, answers nothing.
  async function replay(): Promise<void> {
    try {
      const last = await lastEnrollInvite()
      if (last) show(last)
    } catch {
      // The live event and the node status still report what happened.
    }
  }

  // Without the event channel the supervisor is the signal: report the moment
  // it turns enrolled, never an enrollment it already held when this started.
  async function watchStatus(): Promise<void> {
    let enrolled: boolean | null = null
    const check = async () => {
      try {
        const status = await nodeStatus()
        if (enrolled === false && status.enrolled) {
          show({ seed: null, realm: status.realm, applied: true, error: null })
        }
        enrolled = status.enrolled
      } catch {
        // The node panel already reports what the bridge cannot answer.
      }
    }
    await check()
    if (live) timer = setInterval(() => void check(), WATCH_MS)
  }

  /** Replays first, so a live event always supersedes the retained answer. */
  async function start(): Promise<void> {
    await replay()
    const stop = await onEnrollInvite(show)
    if (!live) return stop?.()
    unlisten = stop
    if (!stop) await watchStatus()
  }

  function clear(): void {
    invite.value = null
  }

  onUnmounted(() => {
    live = false
    unlisten?.()
    clearInterval(timer)
  })

  return { invite, start, clear }
}
