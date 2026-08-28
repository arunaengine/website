// What this device still owes the realm, and what it holds for its owner. The
// status is a module singleton, so the home card, the sync view and the offline
// toggle read one answer; the poll runs faster while anything is in flight.
import { computed, onUnmounted, ref, shallowRef, watch, type Ref } from 'vue'
import {
  classify,
  deviceSyncStatus,
  listDeviceDocuments,
  requireDevice,
  runDeviceSync,
  setDocumentSelection,
  type DeviceDocument,
  type DeviceState,
  type DeviceSyncStatus,
} from '@/lib/deviceApi'
import { useDeviceQuery } from '@/composables/useDeviceQuery'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { isDesktop } from '@/lib/desktop'
import { follow, onWake, POLL_ACTIVE_MS, POLL_IDLE_MS } from '@/lib/poll'
import { errorMessage } from '@/lib/utils'

const EMPTY: DeviceSyncStatus = {
  realmReachable: false,
  lastSyncMs: null,
  pendingTotal: 0,
  documents: [],
  datasets: [],
}

const query = useDeviceQuery<DeviceSyncStatus>(deviceSyncStatus, EMPTY)
const status = query.data
const running = ref(false)
const runError = ref<string | null>(null)

const { deviceClient } = useDeviceStatus()

// What the status said when the run was asked for. The button stays busy until
// a later read shows the run actually moved.
let mark: { lastSyncMs: number | null; pendingTotal: number } | null = null

/** Reads the status once, then decides whether an asked-for run has moved. */
async function read(): Promise<void> {
  await query.run()
  if (!mark) return
  if (status.value.lastSyncMs === mark.lastSyncMs && status.value.pendingTotal >= mark.pendingTotal) return
  running.value = false
  mark = null
}

const loading = computed(() => query.state.value === 'idle' || query.state.value === 'loading')

const pendingDocuments = computed(
  () => status.value.documents.filter((doc) => doc.state === 'pending' || doc.state === 'publishing').length,
)

const pendingDatasets = computed(() => status.value.datasets.filter((set) => set.state === 'pending').length)

/** Everything the sync will not clear on its own: bad metadata and conflicts. */
const needsOwner = computed(
  () =>
    status.value.documents.filter((doc) => doc.state === 'invalid' || doc.state === 'failed').length +
    status.value.datasets.reduce((sum, set) => sum + set.conflicts, 0),
)

/** Tightens while the device owes the realm work, or a run was just asked for. */
const pollMs = computed(() =>
  running.value || status.value.pendingTotal > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS,
)

async function runSync(): Promise<void> {
  if (running.value) return
  runError.value = null
  running.value = true
  mark = { lastSyncMs: status.value.lastSyncMs, pendingTotal: status.value.pendingTotal }
  try {
    await runDeviceSync(requireDevice(deviceClient.value, 'a sync'))
  } catch (err) {
    running.value = false
    mark = null
    runError.value = errorMessage(err)
    return
  }
  await read()
}

const unserved = () => query.state.value === 'unsupported' || query.state.value === 'forbidden'

// Re-armed after every read so a status that turns busy shortens the next wait.
function watchStatus(): void {
  const stop = follow(read, () => pollMs.value, unserved)
  const unwake = onWake(() => void read())
  onUnmounted(() => {
    stop()
    unwake()
  })
}

export function useDeviceSync(options: { poll?: boolean } = {}) {
  if (options.poll !== false) watchStatus()
  return {
    status,
    state: query.state,
    loading,
    error: query.error,
    runError,
    running,
    pollMs,
    pendingDocuments,
    pendingDatasets,
    needsOwner,
    runSync,
    load: read,
  }
}

/**
 * Whether one document is kept on this device, for the control on its page.
 * Desktop only: a browser tab has no node to ask, so the control stays hidden.
 */
export function useOfflineDoc(documentId: Ref<string>) {
  const row = shallowRef<DeviceDocument | null>(null)
  const state = shallowRef<DeviceState>('idle')
  const busy = ref(false)

  async function load(): Promise<void> {
    const client = deviceClient.value
    if (!isDesktop() || !client || !documentId.value) {
      row.value = null
      state.value = 'offline'
      return
    }
    try {
      const documents = await listDeviceDocuments(client)
      row.value = documents.find((doc) => doc.documentId === documentId.value) ?? null
      state.value = 'ready'
    } catch (err) {
      row.value = null
      state.value = classify(err)
    }
  }

  async function setSelected(selected: boolean): Promise<void> {
    const client = deviceClient.value
    if (busy.value || !client || !documentId.value) return
    busy.value = true
    try {
      row.value = await setDocumentSelection(documentId.value, selected, client)
    } catch {
      // The node refused, so the switch snaps back to what it actually holds.
      await load()
    } finally {
      busy.value = false
    }
  }

  watch([documentId, deviceClient], () => void load(), { immediate: true })

  const shown = computed(() => isDesktop() && state.value === 'ready')
  const selected = computed(() => row.value?.selected === true)

  return { row, state, shown, selected, busy, setSelected, load }
}
