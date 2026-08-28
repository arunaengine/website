import {
  type BackendCredentialsRequest,
  type GroupBackendRequest,
  type GroupBackendResponse,
  type ListGroupBackendsResponse,
} from '@/lib/api'
import { request, saving } from './state'

// ── Group storage backends (GET/POST /groups/{gid}/storage-backends) ────────
// Every route takes group ADMIN. Secrets are write-only: no response echoes
// them back, so a caller can only replace them, never read them.

export async function listGroupBackends(groupId: string): Promise<ListGroupBackendsResponse> {
  return request<ListGroupBackendsResponse>(`/groups/${groupId}/storage-backends`)
}

export async function createGroupBackend(
  groupId: string,
  input: GroupBackendRequest,
): Promise<GroupBackendResponse> {
  saving.value = true
  try {
    return await request<GroupBackendResponse>(`/groups/${groupId}/storage-backends`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  } finally {
    saving.value = false
  }
}

// PUT changes name and credentials; the keys naming the physical store are
// fixed after create and a disabled backend refuses the call.
export async function replaceGroupBackend(
  groupId: string,
  backendId: string,
  input: GroupBackendRequest,
): Promise<GroupBackendResponse> {
  saving.value = true
  try {
    return await request<GroupBackendResponse>(
      `/groups/${groupId}/storage-backends/${encodeURIComponent(backendId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    )
  } finally {
    saving.value = false
  }
}

// DELETE disables the backend: stored objects stay readable and the record
// survives. On an older node it is still a hard delete and can answer 409
// while the backend holds data.
export async function disableGroupBackend(groupId: string, backendId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/groups/${groupId}/storage-backends/${encodeURIComponent(backendId)}`, {
      method: 'DELETE',
    })
  } finally {
    saving.value = false
  }
}

// Newer routes; 404 on nodes that predate them (isUnsupportedEndpoint).
export async function enableGroupBackend(
  groupId: string,
  backendId: string,
): Promise<GroupBackendResponse> {
  saving.value = true
  try {
    return await request<GroupBackendResponse>(
      `/groups/${groupId}/storage-backends/${encodeURIComponent(backendId)}/enable`,
      { method: 'POST' },
    )
  } finally {
    saving.value = false
  }
}

export async function replaceBackendCredentials(
  groupId: string,
  backendId: string,
  input: BackendCredentialsRequest,
): Promise<GroupBackendResponse> {
  saving.value = true
  try {
    return await request<GroupBackendResponse>(
      `/groups/${groupId}/storage-backends/${encodeURIComponent(backendId)}/credentials`,
      { method: 'POST', body: JSON.stringify(input) },
    )
  } finally {
    saving.value = false
  }
}
