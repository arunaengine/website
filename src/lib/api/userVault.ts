// --- User vault (/access/users/me/vault) ---
// The vault holders keep each save as a revision; a read returns every current
// head. The portal seals the payload with the user's passphrase, so the nodes
// never read it. A node without the route keeps the keys in this tab's session
// storage.
import { ApiError, apiRequest, type ApiClientOptions } from './client'

export interface UserVaultHead {
  revision: string
  /** The heads this save replaced. */
  predecessors: string[]
  payload: string
  updated_at: string
}

export interface UserVaultResponse {
  /** Empty when there is no vault. More than one head means saves to merge. */
  heads: UserVaultHead[]
}

export interface SaveUserVaultRequest {
  payload: string
  /** Revisions of every head the save replaces; empty for the first save. */
  predecessors: string[]
}

const PATH = '/access/users/me/vault'

/** True when the node does not serve the vault routes, which older nodes do not. */
export function vaultUnsupported(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

/** True when a holder lost a concurrent write; the save was not kept and may be retried. */
export function vaultConflicted(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

/** True when no vault holder answered; it never means the vault is absent. */
export function vaultUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503
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
