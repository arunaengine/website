// --- User devices (GET /users/me/devices, DELETE /users/me/devices/{id}) ---
// Self-scoped: always the caller's own devices, never another user's. An
// enrolled device is addressed by its node id, an in-flight enrollment by its
// enrollment id, and one device is listed once.
export type UserDeviceStatus = 'enrolled' | 'claimed' | 'pending'

export interface UserDevice {
  id: string
  node_id: string | null
  enrollment_id: string | null
  status: UserDeviceStatus
  // Expiry of an outstanding enrollment secret; null once the device enrolled.
  expires_at: number | null
}

export interface UserDevicesResponse {
  devices: UserDevice[]
}
