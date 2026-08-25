// Where a submitted run executes. The choice exists only inside Aruna Desktop,
// and only while this machine's node says it can run jobs at all; everywhere
// else the realm is the single answer and nothing is rendered.
import { computed, onMounted, ref, watch } from 'vue'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { isDesktop } from '@/lib/desktop'
import type { DeviceClient } from '@/lib/deviceApi'

export type RunTarget = 'realm' | 'local'

export function useRunTarget() {
  const { compute, canRunLocally, ensureLoaded } = useDeviceCompute()
  const { deviceClient } = useDeviceStatus()
  const target = ref<RunTarget>('realm')

  const available = computed(() => isDesktop() && canRunLocally.value && deviceClient.value !== null)
  const local = computed(() => available.value && target.value === 'local')

  /** The device API a local submission goes to; null unless one is chosen. */
  const localClient = computed<DeviceClient | null>(() => (local.value ? deviceClient.value : null))

  // A node that stops offering local runs takes the choice back with it.
  watch(available, (ok) => {
    if (!ok) target.value = 'realm'
  })

  onMounted(() => {
    if (isDesktop()) void ensureLoaded()
  })

  return { target, available, local, localClient, compute }
}
