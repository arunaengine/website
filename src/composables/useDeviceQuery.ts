// One read of the device's REST surface, with the states every desktop view
// renders: the node absent, the route unserved, the token refused, or a plain
// failure. The three device composables share it so they cannot drift apart.
import { shallowRef, watch, type Ref } from 'vue'
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

  let inflight: { client: DeviceClient | null; done: Promise<void> } | null = null

  // Another client is another node or session: its answer starts empty and old reads are dropped.
  watch(
    deviceClient,
    () => {
      inflight = null
      data.value = empty
      state.value = 'idle'
      error.value = null
    },
    { flush: 'sync' },
  )

  async function readOnce(client: DeviceClient | null): Promise<void> {
    if (!client) {
      data.value = empty
      state.value = 'offline'
      return
    }
    if (state.value !== 'ready') state.value = 'loading'
    try {
      const next = await read(client)
      if (deviceClient.value !== client) return
      data.value = next
      state.value = 'ready'
      error.value = null
    } catch (err) {
      if (deviceClient.value !== client) return
      state.value = classify(err)
      error.value = errorMessage(err)
    }
  }

  /** One read at a time per client: a caller that asks again joins the one in flight. */
  function run(): Promise<void> {
    const client = deviceClient.value
    if (inflight?.client === client) return inflight.done
    const current = {
      client,
      done: readOnce(client).finally(() => {
        if (inflight === current) inflight = null
      }),
    }
    inflight = current
    return current.done
  }

  return { data, state, error, run }
}
