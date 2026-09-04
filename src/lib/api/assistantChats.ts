// --- Assistant chats (GET+PUT /access/users/me/assistant/chats) ---
// The node stores the portal's chat state as opaque text, so the chats follow
// the user between browsers. A node without the route leaves the chats local.
import { ApiError, apiRequest, type ApiClientOptions } from './client'

export interface AssistantChatsResponse {
  payload: string | null
  /** 0 before the first save; passed back so a stale save is refused. */
  revision: number
  updated_at: string | null
}

export interface SaveAssistantChatsRequest {
  payload: string
  revision?: number
}

const PATH = '/access/users/me/assistant/chats'

/** True when the node does not serve this route, which older nodes do not. */
export function chatsUnsupported(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

/** True when another browser saved since the revision this one holds. */
export function chatsConflicted(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

export function readChats(
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<AssistantChatsResponse> {
  return apiRequest<AssistantChatsResponse>(PATH, { signal }, client)
}

export function saveChats(
  request: SaveAssistantChatsRequest,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<AssistantChatsResponse> {
  return apiRequest<AssistantChatsResponse>(
    PATH,
    { method: 'PUT', body: JSON.stringify(request), signal },
    client,
  )
}
