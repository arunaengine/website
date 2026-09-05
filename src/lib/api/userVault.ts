// --- User vault (/access/users/me/vault) ---
// The node keeps one payload per user that the portal seals with the user's
// passphrase, so the provider keys follow the user between browsers. The node
// never reads the payload. A node without the route keeps the keys in this
// tab's session storage.
import { ApiError, apiRequest, type ApiClientOptions } from './client'

export interface UserVaultResponse {
  /** Null before the first save. */
  payload: string | null
  /** 0 before the first save; bumped by every accepted write. */
  revision: number
  updated_at: string | null
}

export interface SaveUserVaultRequest {
  payload: string
  /** When given, a vault written since is refused with 409. */
  revision?: number
}

const PATH = '/access/users/me/vault'

/** True when the node does not serve the vault routes, which older nodes do not. */
export function vaultUnsupported(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

/** True when another browser wrote the vault since the revision this one holds. */
export function vaultConflicted(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

export function readVault(
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<UserVaultResponse> {
  return apiRequest<UserVaultResponse>(PATH, { signal }, client)
}

export function saveVault(
  request: SaveUserVaultRequest,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<UserVaultResponse> {
  return apiRequest<UserVaultResponse>(
    PATH,
    { method: 'PUT', body: JSON.stringify(request), signal },
    client,
  )
}

export function deleteVault(
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  return apiRequest<void>(PATH, { method: 'DELETE', signal }, client)
}
