// One read of the device's REST surface, with the states every desktop view
// renders: the node absent, the route unserved, the token refused, or a plain
// failure. The three device composables share it so they cannot drift apart.
import { getCurrentScope, onScopeDispose, shallowRef, type Ref } from 'vue'
import { classify, type DeviceClient, type DeviceState } from '@/lib/deviceApi'
import { useDeviceStatus } from '@/composables/useDeviceStatus'

const caches = new Set<() => void>()

/** Drops every loaded device cache; the API base changed under them. */
export function resetDeviceQueries(): void {
  for (const drop of caches) drop()
}

export interface DeviceQuery<T> {
  data: Ref<T>
  state: Ref<DeviceState>
  error: Ref<string | null>
  /** Reads once more; never falls back to the realm when the node is absent. */
  run: () => Promise<void>
}

export function useDeviceQuery<T>(read: (client: DeviceClient) => Promise<T>, empty: T): DeviceQuery<T> {
  const { deviceClient } = useDeviceStatus()
  const data = shallowRef<T>(empty)
  const state = shallowRef<DeviceState>('idle')
  const error = shallowRef<string | null>(null)

  async function run(): Promise<void> {
    const client = deviceClient.value
    if (!client) {
      data.value = empty
      state.value = 'offline'
      return
    }
    if (state.value !== 'ready') state.value = 'loading'
    try {
      data.value = await read(client)
      state.value = 'ready'
      error.value = null
    } catch (err) {
      state.value = classify(err)
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  function drop(): void {
    data.value = empty
    state.value = 'idle'
    error.value = null
  }

  // The module singletons live as long as the window; a per-view query leaves
  // with its own scope.
  caches.add(drop)
  if (getCurrentScope()) onScopeDispose(() => caches.delete(drop))

  return { data, state, error, run }
}
