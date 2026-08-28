// One read of the device's REST surface, with the states every desktop view
// renders: the node absent, the route unserved, the token refused, or a plain
// failure. The three device composables share it so they cannot drift apart.
import { shallowRef, type Ref } from 'vue'
import { classify, type DeviceClient, type DeviceState } from '@/lib/deviceApi'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { errorMessage } from '@/lib/utils'

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

  let inflight: Promise<void> | null = null

  async function readOnce(): Promise<void> {
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
      error.value = errorMessage(err)
    }
  }

  /** One read at a time: a caller that asks again joins the one in flight. */
  function run(): Promise<void> {
    inflight ??= readOnce().finally(() => {
      inflight = null
    })
    return inflight
  }

  return { data, state, error, run }
}
