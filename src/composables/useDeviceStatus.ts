// Supervisor state of the node this machine runs, shared by every desktop
// surface: the top bar pill, the home node card and the device REST wrappers,
// which need the node's own listener base. Desktop only; on the web nothing
// here ever starts.
import { computed, ref, watch } from 'vue'
import { isDesktop } from '@/lib/desktop'
import { useAruna } from '@/composables/useAruna'
import { apiRequest, type InfoResponse } from '@/lib/api'
import { onWake, POLL_IDLE_MS } from '@/lib/poll'
import type { DeviceClient } from '@/lib/deviceApi'
import type { NodeStatus } from '@/lib/desktopBridge'
import { errorMessage } from '@/lib/utils'

const status = ref<NodeStatus | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)
const identity = ref<{ nodeId: string; realm: string } | null>(null)
const identityError = ref<string | null>(null)
// Refcounted: the shell's own views hold it open, and nothing polls the node
// from the welcome routes, which have their own way of watching it.
let watchers = 0
let timer: number | undefined
let unlisten: (() => void) | null = null
let unwake: (() => void) | null = null
let reading: Promise<void> | null = null

async function read(): Promise<void> {
  try {
    const { nodeStatus } = await import('@/lib/desktopBridge')
    status.value = await nodeStatus()
    error.value = null
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loaded.value = true
  }
}

/** Reads the shell's status once; a read already in flight is shared. */
function refresh(): Promise<void> {
  if (!isDesktop()) return Promise.resolve()
  reading ??= read().finally(() => {
    reading = null
  })
  return reading
}

/** Follows the node while a view needs it; balance every call with stop(). */
function start(): void {
  if (!isDesktop()) return
  watchers += 1
  if (watchers > 1) return
  void refresh()
  void import('@/lib/desktopEvents').then(async ({ onNodeStatus }) => {
    const off = await onNodeStatus((next) => {
      status.value = status.value
        ? {
            ...status.value,
            state: next.state,
            ready: next.ready,
            detail: next.detail,
            realmMismatch: next.realmMismatch,
          }
        : next
      error.value = null
      loaded.value = true
    })
    // A stop that landed while the listener was loading takes it right back.
    if (watchers > 0) unlisten = off
    else off?.()
  })
  // The shell pushes `node-status` on every transition, so the poll is only
  // the fallback for a shell that emits none.
  if (typeof window !== 'undefined') {
    timer = window.setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) void refresh()
    }, POLL_IDLE_MS)
    unwake = onWake(() => void refresh())
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
  unwake?.()
  unwake = null
}

const state = computed<NodeStatus['state'] | 'unknown'>(() => status.value?.state ?? 'unknown')

/** The node's own REST base, only once its listener actually answers. */
const nodeBaseUrl = computed(() =>
  status.value?.state === 'running' && status.value.ready ? status.value.apiBaseUrl : null,
)

// What the owner is told in one word; a shell that cannot be reached is not the
// same as a node that is down, so it says so.
const label = computed(() => {
  if (error.value) return 'no shell'
  switch (state.value) {
    case 'running':
      if (status.value?.enrolled) return status.value.ready ? 'online' : 'starting'
      return status.value?.enrolling ? 'connecting' : 'not set up'
    case 'starting':
      return status.value?.enrolling ? 'connecting' : 'starting'
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

// The shell never reports a node id: a node names itself only to a caller with
// a realm token, so it is read from the node's own API with the owner's.
async function readIdentity(client: DeviceClient): Promise<void> {
  try {
    const info = await apiRequest<InfoResponse>('/info', {}, client)
    identity.value = { nodeId: info.node.peer_id, realm: info.node.realm_id }
    identityError.value = null
  } catch (err) {
    identity.value = null
    identityError.value = errorMessage(err)
  }
}

watch(
  deviceClient,
  (client) => {
    identity.value = null
    identityError.value = null
    if (client) void readIdentity(client)
  },
  { immediate: true },
)

export function useDeviceStatus() {
  return {
    status,
    error,
    loaded,
    state,
    label,
    nodeBaseUrl,
    deviceClient,
    identity,
    identityError,
    refresh,
    start,
    stop,
  }
}
