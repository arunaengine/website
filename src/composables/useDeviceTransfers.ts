// What the node is moving on this machine right now: the folder upload outbox
// and the downloads it is materializing. Per-instance, because each surface
// polls only while it is on screen.
import { computed, onUnmounted } from 'vue'
import { getTransfers, type DeviceTransfers } from '@/lib/deviceApi'
import { useDeviceQuery } from '@/composables/useDeviceQuery'

const POLL_MS = 5_000

const EMPTY: DeviceTransfers = { uploads: [], downloads: [] }

export function useDeviceTransfers(options: { poll?: boolean } = {}) {
  const query = useDeviceQuery(getTransfers, EMPTY)
  const { data: transfers, state, error } = query

  if (options.poll !== false && typeof window !== 'undefined') {
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (state.value === 'unsupported' || state.value === 'forbidden') return
      void query.run()
    }, POLL_MS)
    onUnmounted(() => window.clearInterval(timer))
  }

  const all = computed(() => [...transfers.value.uploads, ...transfers.value.downloads])
  const active = computed(() =>
    all.value.filter((transfer) => transfer.state === 'queued' || transfer.state === 'running'),
  )
  const failed = computed(() => all.value.filter((transfer) => transfer.state === 'failed'))

  return { transfers, all, active, failed, state, error, load: query.run }
}
