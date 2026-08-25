// Whether this machine runs jobs itself, and what it is running. Module
// singleton: the run-target selector, the runs view and the device settings all
// ask the same question, and the answer changes only when the owner changes it.
import { computed, ref } from 'vue'
import { getCompute, isDeviceForbidden, isDeviceUnsupported, type DeviceCompute } from '@/lib/deviceApi'
import { useDeviceStatus } from '@/composables/useDeviceStatus'

export type ComputeState = 'idle' | 'loading' | 'ready' | 'offline' | 'unsupported' | 'forbidden' | 'error'

const compute = ref<DeviceCompute | null>(null)
const state = ref<ComputeState>('idle')
const error = ref<string | null>(null)

const { deviceClient } = useDeviceStatus()

async function load(): Promise<void> {
  const client = deviceClient.value
  if (!client) {
    compute.value = null
    state.value = 'offline'
    return
  }
  if (state.value !== 'ready') state.value = 'loading'
  try {
    compute.value = await getCompute(client)
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

async function ensureLoaded(): Promise<void> {
  if (state.value === 'ready' || state.value === 'loading') return
  await load()
}

// A paused node refuses local runs, so the selector must not offer them.
const canRunLocally = computed(
  () => state.value === 'ready' && compute.value?.enabled === true && compute.value.paused !== true,
)

export function useDeviceCompute() {
  return { compute, state, error, canRunLocally, load, ensureLoaded }
}
