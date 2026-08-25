// Whether this machine runs jobs itself, and what it is running. Module
// singleton: the run-target selector, the runs view and the device settings all
// ask the same question, and the answer changes only when the owner changes it.
import { computed } from 'vue'
import { getCompute, type DeviceCompute } from '@/lib/deviceApi'
import { useDeviceQuery } from '@/composables/useDeviceQuery'

const query = useDeviceQuery<DeviceCompute | null>(getCompute, null)

async function ensureLoaded(): Promise<void> {
  if (query.state.value === 'ready' || query.state.value === 'loading') return
  await query.run()
}

// A paused node refuses local runs, so the selector must not offer them.
const canRunLocally = computed(
  () => query.state.value === 'ready' && query.data.value?.enabled === true && query.data.value.paused !== true,
)

export function useDeviceCompute() {
  return {
    compute: query.data,
    state: query.state,
    error: query.error,
    canRunLocally,
    load: query.run,
    ensureLoaded,
  }
}
