// What the node is moving on this machine right now: the folder upload outbox
// and the downloads it is materializing. Per-instance, because each surface
// polls only while it is on screen.
import { computed, onUnmounted, ref } from 'vue'
import { getTransfers, isDeviceForbidden, isDeviceUnsupported, type DeviceTransfers } from '@/lib/deviceApi'
import { useDeviceStatus } from '@/composables/useDeviceStatus'

const POLL_MS = 5_000

export type TransfersState = 'idle' | 'loading' | 'ready' | 'offline' | 'unsupported' | 'forbidden' | 'error'

const EMPTY: DeviceTransfers = { uploads: [], downloads: [] }

export function useDeviceTransfers(options: { poll?: boolean } = {}) {
  const { deviceClient } = useDeviceStatus()
  const transfers = ref<DeviceTransfers>(EMPTY)
  const state = ref<TransfersState>('idle')
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    const client = deviceClient.value
    if (!client) {
      transfers.value = EMPTY
      state.value = 'offline'
      return
    }
    if (state.value !== 'ready') state.value = 'loading'
    try {
      transfers.value = await getTransfers(client)
      state.value = 'ready'
      error.value = null
    } catch (err) {
      if (isDeviceUnsupported(err)) state.value = 'unsupported'
      else if (isDeviceForbidden(err)) state.value = 'forbidden'
      else {
        state.value = 'error'
        error.value = err instanceof Error ? err.message : String(err)
      }
    }
  }

  if (options.poll !== false && typeof window !== 'undefined') {
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (state.value === 'unsupported' || state.value === 'forbidden') return
      void load()
    }, POLL_MS)
    onUnmounted(() => window.clearInterval(timer))
  }

  const all = computed(() => [...transfers.value.uploads, ...transfers.value.downloads])
  const active = computed(() =>
    all.value.filter((transfer) => transfer.state === 'queued' || transfer.state === 'running'),
  )
  const failed = computed(() => all.value.filter((transfer) => transfer.state === 'failed'))

  return { transfers, all, active, failed, state, error, load }
}
