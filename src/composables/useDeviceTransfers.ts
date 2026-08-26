// What the node is moving on this machine right now: the folder upload outbox
// and the downloads it is materializing. Per-instance, because each surface
// polls only while it is on screen.
import { computed, onUnmounted } from 'vue'
import { getTransfers, type DeviceTransfers } from '@/lib/deviceApi'
import { useDeviceQuery } from '@/composables/useDeviceQuery'
import { follow, onWake, POLL_ACTIVE_MS, POLL_IDLE_MS } from '@/lib/poll'

const EMPTY: DeviceTransfers = { uploads: [], downloads: [] }

export function useDeviceTransfers(options: { poll?: boolean } = {}) {
  const query = useDeviceQuery(getTransfers, EMPTY)
  const { data: transfers, state, error } = query

  const all = computed(() => [...transfers.value.uploads, ...transfers.value.downloads])
  const active = computed(() =>
    all.value.filter((transfer) => transfer.state === 'queued' || transfer.state === 'running'),
  )
  const failed = computed(() => all.value.filter((transfer) => transfer.state === 'failed'))

  // Bytes in motion are worth watching closely; an idle outbox is not.
  if (options.poll !== false) {
    const stop = follow(
      query.run,
      () => (active.value.length ? POLL_ACTIVE_MS : POLL_IDLE_MS),
      () => state.value === 'unsupported' || state.value === 'forbidden',
    )
    const unwake = onWake(() => void query.run())
    onUnmounted(() => {
      stop()
      unwake()
    })
  }

  return { transfers, all, active, failed, state, error, load: query.run }
}
