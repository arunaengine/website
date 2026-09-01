import {
  type CreateS3CredentialsRequest,
  type CreateS3CredentialsResponse,
  type GetUserResponse,
  type ListUsersResponse,
  type ResolveUserResult,
  type UserInfoResponse,
  type UserSearchResponse,
} from '@/lib/api'
import { loadAuthenticated } from './identity'
import { request, saving, userInfo } from './state'

// Favourites live in the user attribute ui.favourite_metadata_ids as a
// comma-separated id list (see backend user_preferences_from_attributes).
export async function doToggleFavourite(documentId: string): Promise<void> {
  const current = userInfo.value?.preferences.favourite_metadata_ids ?? []
  const next = current.includes(documentId)
    ? current.filter((id) => id !== documentId)
    : [...current, documentId]
  const body = next.length
    ? { set_attributes: { 'ui.favourite_metadata_ids': next.join(',') } }
    : { remove_attributes: ['ui.favourite_metadata_ids'] }
  const updated = await request<UserInfoResponse>('/access/users/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  userInfo.value = updated // PATCH returns the full GetUserInfoResponse
}

// Serialize toggles: every call PATCHes the whole comma-joined attribute from
// the id list at run time, so concurrent toggles across documents would race
// (last write wins, silently reverting the other). Chaining forces each toggle
// to observe the prior one's committed userInfo. Per-call errors still
// propagate to the caller; the queue absorbs them so one failure can't wedge
// the chain.
let favouriteQueue: Promise<unknown> = Promise.resolve()
export async function toggleFavourite(documentId: string): Promise<void> {
  const run = favouriteQueue.then(() => doToggleFavourite(documentId))
  favouriteQueue = run.catch(() => undefined)
  return run
}

export async function updateUserProfile(input: {
  name?: string
  set_attributes?: Record<string, string>
  remove_attributes?: string[]
}) {
  saving.value = true
  try {
    await request<UserInfoResponse>('/access/users/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    await loadAuthenticated()
  } finally {
    saving.value = false
  }
}

export async function createS3Credentials(input: CreateS3CredentialsRequest): Promise<CreateS3CredentialsResponse> {
  saving.value = true
  try {
    const created = await request<CreateS3CredentialsResponse>('/access/credentials', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await loadAuthenticated().catch(() => undefined)
    return created
  } finally {
    saving.value = false
  }
}

export async function revokeS3Credential(accessKeyId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/access/credentials/${encodeURIComponent(accessKeyId)}`, { method: 'DELETE' })
    await loadAuthenticated().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

export async function searchUsers(q: string, limit = 20): Promise<UserSearchResponse> {
  return request<UserSearchResponse>('/access/users/search', { query: { q, limit } })
}

export async function getUser(userId: string): Promise<GetUserResponse> {
  return request<GetUserResponse>(`/access/users/${encodeURIComponent(userId)}`)
}

export async function listUsers(opts: { limit?: number; startAfter?: string } = {}): Promise<ListUsersResponse> {
  return request<ListUsersResponse>('/access/users', {
    query: { limit: opts.limit, start_after: opts.startAfter },
  })
}

export async function resolveUsers(userIds: string[]): Promise<ResolveUserResult[]> {
  return request<ResolveUserResult[]>('/access/users/resolve', {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  })
}
