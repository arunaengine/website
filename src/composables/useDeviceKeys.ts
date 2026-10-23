// The access keys of the node on this computer. Keys are node-local, so they
// are read and changed through the device client only; without it nothing can
// be listed, made or removed. An answer for an earlier node or session is
// dropped, never shown.
import { computed, shallowRef, watch } from 'vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import {
  classify,
  createDeviceCredential,
  listDeviceCredentials,
  requireDevice,
  revokeDeviceCredential,
  type DeviceClient,
  type DeviceState,
} from '@/lib/deviceApi'
import type { CreateS3CredentialsResponse, S3CredentialSummary } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

const keys = shallowRef<S3CredentialSummary[]>([])
const state = shallowRef<DeviceState>('idle')
const error = shallowRef<string | null>(null)
const { deviceClient } = useDeviceStatus()
let generation = 0

async function load(): Promise<void> {
  const client = deviceClient.value
  const mine = ++generation
  if (!client) {
    keys.value = []
    state.value = 'offline'
    return
  }
  if (state.value !== 'ready') state.value = 'loading'
  try {
    const found = await listDeviceCredentials(client)
    if (mine !== generation || deviceClient.value !== client) return
    keys.value = found
    state.value = 'ready'
    error.value = null
  } catch (err) {
    if (mine !== generation || deviceClient.value !== client) return
    keys.value = []
    state.value = classify(err)
    error.value = errorMessage(err)
  }
}

// A new node or a new session starts from nothing.
watch(
  deviceClient,
  () => {
    generation += 1
    keys.value = []
    error.value = null
    state.value = 'idle'
    if (deviceClient.value) void load()
  },
  { immediate: true },
)

function client(): DeviceClient {
  return requireDevice(deviceClient.value, 'its access keys')
}

async function create(groupId: string, expiresInSeconds: number): Promise<CreateS3CredentialsResponse> {
  const target = client()
  const made = await createDeviceCredential({ group_id: groupId, expires_in_seconds: expiresInSeconds }, target)
  if (deviceClient.value !== target) {
    throw new Error('This computer changed while the key was made, so its secret is not shown. Look for the key again.')
  }
  await load()
  // The reload may have outlasted the session too.
  if (deviceClient.value !== target) {
    throw new Error('This computer changed while the key was made, so its secret is not shown. Look for the key again.')
  }
  return made
}

async function remove(accessKeyId: string): Promise<void> {
  await revokeDeviceCredential(accessKeyId, client())
  await load()
}

const active = computed(() => keys.value.filter((key) => key.status === 'active'))
/** Keys can be made and removed only while this computer's node answers. */
const available = computed(() => deviceClient.value !== null && state.value !== 'unsupported' && state.value !== 'forbidden')

export function useDeviceKeys() {
  return { keys, active, state, error, available, load, create, remove }
}
