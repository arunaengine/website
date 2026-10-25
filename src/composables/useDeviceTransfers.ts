// What the node is moving on this machine right now: the folder upload outbox
// and the downloads it is materializing. Module singleton, so a page shows the
// last answer at once and one poll runs while any page needs it.
import { computed, onUnmounted } from 'vue'
import { getTransfers, isMoving, type DeviceTransfers } from '@/lib/deviceApi'
import { useDeviceQuery } from '@/composables/useDeviceQuery'
import { POLL_ACTIVE_MS, POLL_FAST_MS, POLL_IDLE_MS, sharedPoll } from '@/lib/poll'

const EMPTY: DeviceTransfers = { uploads: [], downloads: [] }

const query = useDeviceQuery(getTransfers, EMPTY)
const { data: transfers, state, error } = query

const all = computed(() => [...transfers.value.uploads, ...transfers.value.downloads])
const active = computed(() =>
  all.value.filter((transfer) => transfer.state === 'queued' || isMoving(transfer)),
)
const failed = computed(() => all.value.filter((transfer) => transfer.state === 'failed'))

// A running upload is followed closely, a waiting outbox less so, an idle one least.
const poll = sharedPoll(
  query.run,
  () => (transfers.value.uploads.some(isMoving) ? POLL_FAST_MS : active.value.length ? POLL_ACTIVE_MS : POLL_IDLE_MS),
  () => state.value === 'unsupported' || state.value === 'forbidden',
)

export function useDeviceTransfers(options: { poll?: boolean } = {}) {
  if (options.poll !== false) {
    poll.start()
    onUnmounted(poll.stop)
  }

  return { transfers, all, active, failed, state, error, load: query.run }
}
