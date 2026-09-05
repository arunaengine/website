// --- Assistant chats (/access/users/me/assistant/chats) ---
// The node keeps one head per chat and a log of turns whose payload is opaque
// text the portal owns, so the chats follow the user between browsers. A node
// without the routes leaves the chats local.
import { ApiError, apiRequest, type ApiClientOptions } from './client'

export interface AssistantChatHead {
  id: string
  title: string
  subject: string | null
  created_at: string
  updated_at: string
  /** Live turns are the seqs in [first_seq, next_seq). */
  first_seq: number
  next_seq: number
  bytes: number
  /** Bumped by every accepted head or turn write. */
  revision: number
}

export interface AssistantChatTurn {
  seq: number
  payload: string
  updated_at: string
}

export interface ListAssistantChatsResponse {
  chats: AssistantChatHead[]
}

export interface ReadAssistantTurnsResponse {
  turns: AssistantChatTurn[]
}

export interface PutAssistantChatRequest {
  title: string
  subject?: string
  /** When given, a head written since is refused with 409. */
  revision?: number
}

export interface PutAssistantTurnRequest {
  payload: string
  /** The head revision the portal holds; a write since is refused with 409. */
  revision?: number
}

const PATH = '/access/users/me/assistant/chats'

function chatPath(id: string): string {
  return `${PATH}/${encodeURIComponent(id)}`
}

/** True when the node does not serve these routes, which older nodes do not. */
export function chatsUnsupported(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

/** True when another browser wrote the chat since the revision or seq this one holds. */
export function chatsConflicted(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

/** True when the chat was deleted on the node. */
export function chatGone(error: unknown): boolean {
  return error instanceof ApiError && error.status === 410
}

export function listChats(
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<ListAssistantChatsResponse> {
  return apiRequest<ListAssistantChatsResponse>(PATH, { signal }, client)
}

export function putChat(
  id: string,
  request: PutAssistantChatRequest,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<AssistantChatHead> {
  return apiRequest<AssistantChatHead>(
    chatPath(id),
    { method: 'PUT', body: JSON.stringify(request), signal },
    client,
  )
}

/** The turns after `after`, or every live turn when it is not given. */
export function readTurns(
  id: string,
  after?: number,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<ReadAssistantTurnsResponse> {
  return apiRequest<ReadAssistantTurnsResponse>(`${chatPath(id)}/turns`, { query: { after }, signal }, client)
}

/** Appends the turn at `next_seq` or rewrites the one before it; answers with the head after the write. */
export function putTurn(
  id: string,
  seq: number,
  request: PutAssistantTurnRequest,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<AssistantChatHead> {
  return apiRequest<AssistantChatHead>(
    `${chatPath(id)}/turns/${seq}`,
    { method: 'PUT', body: JSON.stringify(request), signal },
    client,
  )
}

export function deleteChat(
  id: string,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  return apiRequest<void>(chatPath(id), { method: 'DELETE', signal }, client)
}
