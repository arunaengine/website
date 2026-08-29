// What the chat panel renders and what the tool layer hands back to the model.

/** What a denied tool call answers the model, as NovaCrate words it. */
export const DENIAL_MESSAGE = 'The user has denied this operation'

export type ToolCallState = 'approval' | 'running' | 'done' | 'error' | 'denied'

export interface ToolCallView {
  id: string
  name: string
  input: unknown
  state: ToolCallState
  output?: unknown
  error?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  calls: ToolCallView[]
  /** Set when the provider or the loop itself failed, e.g. "429 rate limited". */
  error?: string
}

export interface ApprovalRequest {
  id: string
  name: string
  input: unknown
}

/**
 * Asks the user about one tool call. `always` marks a call that is asked about
 * whatever the approval toggle says (a draft delete).
 */
export interface ApprovalGate {
  enabled: () => boolean
  ask: (request: ApprovalRequest, always: boolean) => Promise<boolean>
}

/** The result shape a denied call answers with. */
export function denied(): { error: string } {
  return { error: DENIAL_MESSAGE }
}
