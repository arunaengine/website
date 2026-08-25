// Device enrollment (aruna#271). Self-service: minting mode 'User' needs only a
// realm member holding an unrestricted token on a management node, never the
// onboarding admin gates, so this is deliberately separate from
// useNodeOnboarding's admin list/revoke surface.
//
// Per-view FACTORY, not a module singleton: the 5s claim poll belongs to the one
// view that minted, and two views must never share a watcher. Must be called
// during component setup (registers onUnmounted). Builds its API client from
// useAruna's exported apiBaseUrl/authToken refs (precedent: useJoinRequests).
import { computed, onUnmounted, ref } from 'vue'
import {
  ApiError,
  apiRequest,
  type CreateOnboardingSecretResponse,
  type OnboardingSecretStatus,
  type UserDevice,
  type UserDevicesResponse,
} from '@/lib/api'
import { useAruna } from '@/composables/useAruna'

export const WATCH_INTERVAL_MS = 5_000

// pending → the secret is live and unclaimed; claimed → a device redeemed it;
// present → it is a member of the realm configuration. Devices never publish
// DHT presence, so membership is the last stage the realm can observe.
export type DevicePhase = 'idle' | 'pending' | 'claimed' | 'present' | 'expired'

export interface DeviceWatch {
  phase: DevicePhase
  enrollmentId: string | null
  nodeId: string | null
  // Transient poll errors surface inline; never a global error per tick.
  lastError: string | null
}

// Every failure the enrollment routes document, in the owner's words.
export function deviceErrorMessage(err: unknown, limit: number | null): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session expired. Sign in again to enroll a device.'
    if (err.status === 403) {
      return 'Refused. Managing devices needs an unrestricted token — a path-restricted one is never accepted — on a management node, and a realm policy can forbid enrollment outright.'
    }
    if (err.status === 409) {
      const cap = limit == null ? '' : ` This realm allows ${limit} per user.`
      return `Device cap reached.${cap} Remove a device below, or retry: a concurrent enrollment answers the same way.`
    }
    if (err.status === 503) return 'The node is out of storage capacity for new enrollments. Try again in a moment.'
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}

function idleWatch(): DeviceWatch {
  return { phase: 'idle', enrollmentId: null, nodeId: null, lastError: null }
}

export function useDeviceEnrollment() {
  const { apiBaseUrl, authToken, realmInfo, loadInfo } = useAruna()

  const devices = ref<UserDevice[]>([])
  const loadingDevices = ref(false)
  const devicesError = ref<string | null>(null)
  const minting = ref(false)
  const mintError = ref<string | null>(null)
  // The enrollment in flight: the secret exists only here until the view leaves.
  const minted = ref<CreateOnboardingSecretResponse | null>(null)
  const busyIds = ref<Set<string>>(new Set())
  const watch = ref<DeviceWatch>(idleWatch())

  function request<T>(path: string, options = {}) {
    return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
  }

  // Enrolled devices and outstanding enrollments both occupy a slot, and the
  // list already charges a claimed-and-enrolled device once.
  const deviceLimit = computed(() => realmInfo.value?.quota?.max_devices_per_user ?? null)
  const deviceCount = computed(() => devices.value.length)
  const atCap = computed(() => deviceLimit.value != null && deviceCount.value >= deviceLimit.value)

  function message(err: unknown): string {
    return deviceErrorMessage(err, deviceLimit.value)
  }

  function nowSecs(): number {
    return Date.now() / 1000
  }

  async function loadDevices(): Promise<void> {
    loadingDevices.value = true
    try {
      const response = await request<UserDevicesResponse>('/users/me/devices')
      devices.value = response.devices
      devicesError.value = null
    } catch (err) {
      devicesError.value = message(err)
    } finally {
      loadingDevices.value = false
    }
  }

  // Fallback for a node whose mint response names no enrollment: the caller's
  // own device list does, through the new entry whose expiry matches the mint.
  function newEnrollment(before: Set<string>, expiresAt: number): string | null {
    const fresh = devices.value.filter((device) => !before.has(device.id) && device.enrollment_id)
    const exact = fresh.find((device) => device.expires_at === expiresAt)
    return (exact ?? fresh[0])?.enrollment_id ?? null
  }

  async function mint(
    expiresInSeconds: number,
  ): Promise<{ response: CreateOnboardingSecretResponse; enrollmentId: string | null }> {
    minting.value = true
    mintError.value = null
    try {
      await loadDevices()
      const before = new Set(devices.value.map((device) => device.id))
      // seed_url '' asks the node to fill in its own published REST base URL.
      const response = await request<CreateOnboardingSecretResponse>('/admin/onboarding/secrets', {
        method: 'POST',
        body: JSON.stringify({ seed_url: '', mode: 'User', expires_in_seconds: expiresInSeconds }),
      })
      await loadDevices()
      minted.value = response
      const enrollmentId = response.enrollment_id ?? newEnrollment(before, response.expires_at)
      return { response, enrollmentId }
    } catch (err) {
      mintError.value = message(err)
      throw err
    } finally {
      minting.value = false
    }
  }

  function markBusy(id: string, active: boolean) {
    const next = new Set(busyIds.value)
    if (active) next.add(id)
    else next.delete(id)
    busyIds.value = next
  }

  async function revoke(id: string): Promise<void> {
    markBusy(id, true)
    let failure: string | null = null
    try {
      await request<void>(`/users/me/devices/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch (err) {
      // A 404 means the device is already gone; the row disappears either way.
      if (!(err instanceof ApiError && err.status === 404)) failure = message(err)
    } finally {
      // Reload first (it clears devicesError on success), THEN surface the
      // failure, so a working list endpoint cannot erase the message.
      await loadDevices()
      if (failure) devicesError.value = failure
      markBusy(id, false)
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined
  let watchExpiresAt = 0
  let devicesBefore = new Set<string>()

  function patch(next: Partial<DeviceWatch>) {
    watch.value = { ...watch.value, ...next }
  }

  function finish(phase: DevicePhase) {
    patch({ phase })
    stopWatch()
  }

  async function checkPresence(): Promise<void> {
    await loadInfo()
    const nodeId = watch.value.nodeId
    if (!nodeId || !(realmInfo.value?.nodes ?? []).some((node) => node.node_id === nodeId)) return
    finish('present')
    await loadDevices()
  }

  // Fallback when the status route cannot answer: the device list is the
  // authority on what actually landed.
  async function settleFromDevices(): Promise<void> {
    await loadDevices()
    const joined = devices.value.find(
      (device) => device.status === 'enrolled' && !devicesBefore.has(device.id),
    )
    if (joined) {
      patch({ nodeId: joined.node_id })
      finish('present')
    } else if (nowSecs() > watchExpiresAt) {
      finish('expired')
    }
  }

  async function tick(): Promise<void> {
    try {
      if (!watch.value.enrollmentId) return await settleFromDevices()
      const path = `/onboarding/secrets/${encodeURIComponent(watch.value.enrollmentId)}/status`
      const status = await request<OnboardingSecretStatus>(path)
      patch({ lastError: null })
      if (status.status === 'expired') return finish('expired')
      if (status.status !== 'claimed') return patch({ phase: 'pending' })
      patch({ phase: 'claimed', nodeId: status.claimed_node_id })
      await checkPresence()
    } catch (err) {
      // The record is pruned once enrollment completes, and a foreign id answers
      // alike, so a 404 means the device list decides what happened.
      if (err instanceof ApiError && err.status === 404) {
        await settleFromDevices()
        return
      }
      patch({ lastError: message(err) })
    }
  }

  function startWatch(enrollmentId: string | null, expiresAt: number) {
    stopWatch()
    watchExpiresAt = expiresAt
    devicesBefore = new Set(devices.value.map((device) => device.id))
    watch.value = { phase: 'pending', enrollmentId, nodeId: null, lastError: null }
    void tick()
    timer = setInterval(() => void tick(), WATCH_INTERVAL_MS)
  }

  function stopWatch() {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  function resetWatch() {
    stopWatch()
    watch.value = idleWatch()
    minted.value = null
  }

  // Consumers cannot leak the interval: it is cleared when the view unmounts.
  onUnmounted(stopWatch)

  return {
    devices,
    loadingDevices,
    devicesError,
    minting,
    mintError,
    minted,
    busyIds,
    watch,
    deviceLimit,
    deviceCount,
    atCap,
    loadDevices,
    mint,
    revoke,
    startWatch,
    stopWatch,
    resetWatch,
  }
}
