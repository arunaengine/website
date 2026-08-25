// Supervisor state of the node this machine runs, shared by every desktop
// surface: the top bar pill, the home node card and the device REST wrappers,
// which need the node's own listener base. Desktop only; on the web nothing
// here ever starts.
import { computed, ref } from 'vue'
import { isDesktop } from '@/lib/desktop'
import { useAruna } from '@/composables/useAruna'
import type { DeviceClient } from '@/lib/deviceApi'
import type { NodeStatus } from '@/lib/desktopBridge'

// The shell pushes `node-status` on every transition, so the poll is only the
// fallback for a shell that emits none.
const POLL_MS = 15_000

const status = ref<NodeStatus | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)
// Refcounted: the shell's own views hold it open, and nothing polls the node
// from the welcome routes, which have their own way of watching it.
let watchers = 0
let timer: number | undefined
let unlisten: (() => void) | null = null

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function refresh(): Promise<void> {
  if (!isDesktop()) return
  try {
    const { nodeStatus } = await import('@/lib/desktopBridge')
    status.value = await nodeStatus()
    error.value = null
  } catch (err) {
    error.value = message(err)
  } finally {
    loaded.value = true
  }
}

/** Follows the node while a view needs it; balance every call with stop(). */
function start(): void {
  if (!isDesktop()) return
  watchers += 1
  if (watchers > 1) return
  void refresh()
  void import('@/lib/desktopEvents').then(async ({ onNodeStatus }) => {
    const off = await onNodeStatus((next) => {
      status.value = next
      error.value = null
      loaded.value = true
    })
    // A stop that landed while the listener was loading takes it right back.
    if (watchers > 0) unlisten = off
    else off?.()
  })
  if (typeof window !== 'undefined') {
    timer = window.setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) void refresh()
    }, POLL_MS)
  }
}

function stop(): void {
  if (!isDesktop() || watchers === 0) return
  watchers -= 1
  if (watchers > 0) return
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
  unlisten?.()
  unlisten = null
}

const state = computed<NodeStatus['state'] | 'unknown'>(() => status.value?.state ?? 'unknown')

/** The node's own REST base, only while it is up enough to answer. */
const nodeBaseUrl = computed(() =>
  status.value?.state === 'running' ? status.value.apiBaseUrl : null,
)

// What the owner is told in one word; a shell that cannot be reached is not the
// same as a node that is down, so it says so.
const label = computed(() => {
  if (error.value) return 'no shell'
  switch (state.value) {
    case 'running':
      return status.value?.enrolled ? 'online' : 'not enrolled'
    case 'starting':
      return 'starting'
    case 'stopped':
      return 'stopped'
    case 'error':
      return 'error'
    default:
      return 'checking'
  }
})

// The device routes answer to the owner's own token against the node's own
// listener; without either there is nothing to call.
const { authToken } = useAruna()
const deviceClient = computed<DeviceClient | null>(() =>
  nodeBaseUrl.value && authToken.value ? { baseUrl: nodeBaseUrl.value, token: authToken.value } : null,
)

export function useDeviceStatus() {
  return { status, error, loaded, state, label, nodeBaseUrl, deviceClient, refresh, start, stop }
}
