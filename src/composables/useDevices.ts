import { computed, ref, watch } from 'vue'
import {
  apiRequest,
  type EnrollUserDeviceRequest,
  type EnrollUserDeviceResponse,
  type ListUserDevicesResponse,
  type UserDevice,
} from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'

// User devices (aruna#271). The backend does not serve these endpoints yet
// (gated on the aruna#272 security guard); every path here is gated behind the
// `deviceEnrollment` feature flag, so with the default config (features: {})
// this module is inert — no HTTP call can fire because every loader/mutation
// starts with assertEnabled().

const devices = ref<UserDevice[]>([])
const devicesLoaded = ref(false)
const devicesError = ref<string | null>(null)
const busy = ref(false)
const evictingIds = ref<string[]>([])

const deviceEnrollmentEnabled = computed(() => featureEnabled('deviceEnrollment'))

// Account switches (manual token swap) and the non-Keycloak sign-out change
// currentUser without a page reload, so the module-singleton device cache would
// otherwise survive and render the previous account's devices. Mirror
// useJoinRequests / useNotifications: reset on account change. Reset only — no
// HTTP, no featureEnabled read — so the flag-off zero-HTTP guarantee holds.
if (typeof window !== 'undefined') {
  const { currentUser } = useAruna()
  watch(
    () => currentUser.value?.id,
    (id, prev) => {
      if (id === prev) return
      devices.value = []
      devicesLoaded.value = false
      devicesError.value = null
    },
  )
}

export type DeviceStatus = 'pending' | 'active' | 'expired'

// A device is 'active' once it has redeemed its token (node_id set); a pending
// enrollment whose token has passed its expiry is 'expired'; otherwise pending.
export function deviceStatus(d: UserDevice, nowSecs = Date.now() / 1000): DeviceStatus {
  if (d.node_id) return 'active'
  if (d.expires_at != null && nowSecs > d.expires_at) return 'expired'
  return 'pending'
}

function assertEnabled() {
  if (!featureEnabled('deviceEnrollment')) {
    throw new Error(
      'Device enrollment is not enabled on this portal (portal-config features.deviceEnrollment)',
    )
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Sibling of useAruna: reuse its apiBaseUrl/authToken refs to build the same client.
function request<T>(path: string, options = {}) {
  const { apiBaseUrl, authToken } = useAruna()
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
}

// GET /users/devices — own pending enrollments + claimed devices.
// not yet provided by the backend (aruna#271; gated on #272). A missing backend
// must degrade to an inline notice, so this catches and stores the error rather
// than throwing.
async function loadDevices(): Promise<void> {
  assertEnabled()
  devicesError.value = null
  try {
    const response = await request<ListUserDevicesResponse>('/users/devices')
    devices.value = response.devices
    devicesLoaded.value = true
  } catch (err) {
    devicesError.value = errorMessage(err)
  }
}

// Idempotent mount hook: load once, skip when already loaded or signed out.
async function ensureDevicesLoaded(): Promise<void> {
  if (!featureEnabled('deviceEnrollment')) return
  const { authToken } = useAruna()
  if (devicesLoaded.value || !authToken.value) return
  await loadDevices()
}

// POST /users/devices/enroll — mint a one-time device token bound to the bearer
// identity. not yet provided by the backend (aruna#271; gated on #272). Throws
// ApiError upward: a 403 (the future #272 guard), 404 (backend without #271) or
// 409 (server-side cap) is the honest shape the wizard renders verbatim.
async function enrollDevice(input: EnrollUserDeviceRequest): Promise<EnrollUserDeviceResponse> {
  assertEnabled()
  busy.value = true
  try {
    const body: EnrollUserDeviceRequest = { seed_url: input.seed_url }
    if (input.device_name && input.device_name.trim()) body.device_name = input.device_name.trim()
    if (input.expires_in_seconds != null) body.expires_in_seconds = input.expires_in_seconds
    const response = await request<EnrollUserDeviceResponse>('/users/devices/enroll', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    void loadDevices().catch(() => undefined)
    return response
  } finally {
    busy.value = false
  }
}

// DELETE /users/devices/{enrollment_id} — revoke a pending token or evict a
// claimed device (the backend removes the user node realm-wide, mirroring the
// RealmNodeKind::User handling). not yet provided by the backend (aruna#271;
// gated on #272). 404 is treated as success (already gone). The enrollment id is
// the stable key across pending → claimed (a node_id only exists after the claim).
async function evictDevice(enrollmentId: string): Promise<void> {
  assertEnabled()
  evictingIds.value = [...evictingIds.value, enrollmentId]
  try {
    try {
      await request<void>(`/users/devices/${encodeURIComponent(enrollmentId)}`, { method: 'DELETE' })
    } catch (err) {
      // Already evicted — treat as success so the row disappears cleanly.
      if (!(err instanceof Error && /\b404\b/.test(err.message))) throw err
    }
    devices.value = devices.value.filter((d) => d.enrollment_id !== enrollmentId)
    void loadDevices().catch(() => undefined)
    // Eviction propagates realm-wide — the user node must drop out of
    // realmInfo.nodes, so refresh the shared realm info.
    void useAruna().loadInfo()
  } finally {
    evictingIds.value = evictingIds.value.filter((id) => id !== enrollmentId)
  }
}

// Cap from the realm quota policy (already served by GET /info/realm). The
// client-side check is UX only — enforcement is backend work (aruna#271/#272).
const deviceCap = computed<number | null>(
  () => useAruna().realmInfo.value?.quota?.max_devices_per_user ?? null,
)
// Pending (non-expired) enrollments count toward the cap until they expire.
const deviceCount = computed(() => devices.value.filter((d) => deviceStatus(d) !== 'expired').length)
const capReached = computed(() => deviceCap.value !== null && deviceCount.value >= deviceCap.value)

export function useDevices() {
  return {
    deviceEnrollmentEnabled,
    devices,
    devicesLoaded,
    devicesError,
    busy,
    evictingIds,
    deviceCap,
    deviceCount,
    capReached,
    loadDevices,
    ensureDevicesLoaded,
    enrollDevice,
    evictDevice,
  }
}
