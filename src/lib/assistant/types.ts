// What the chat panel renders and what the tool layer hands back to the model.
import type { PreviewKind } from '@/composables/useObjectPreview'

/** What a denied tool call answers the model, as NovaCrate words it. */
export const DENIAL_MESSAGE = 'The user has denied this operation'

export type ToolCallState = 'approval' | 'running' | 'done' | 'error' | 'denied'

export type ChartKind = 'bar' | 'line' | 'pie'

/**
 * One stored object the chat shows. `url` is a blob URL for bytes already in
 * the tab and a presigned URL for anything only offered for download; it never
 * survives a reload, so a restored transcript shows the card's error state.
 */
export interface ArtifactView {
  url: string
  contentType: string
  previewKind: PreviewKind
  name: string
  size?: number
  bucket: string
  key: string
  versionId?: string
  jobId?: string
}

/** What a render tool asked the conversation to show; kept beside the call. */
export type RenderView =
  | { kind: 'table'; title: string; columns: string[]; rows: unknown[][] }
  | { kind: 'chart'; title: string; chart: ChartKind; labels: string[]; series: Array<{ name: string; values: number[] }> }
  | { kind: 'stats'; title: string; items: Array<{ label: string; value: string; hint?: string }> }
  | { kind: 'crate'; title: string; documentId?: string; crate: unknown }
  | { kind: 'artifact'; title: string; caption?: string; artifact: ArtifactView }

export interface ToolCallView {
  id: string
  name: string
  input: unknown
  state: ToolCallState
  output?: unknown
  error?: string
  /** Set by a render tool: the card the message shows in place of raw output. */
  view?: RenderView
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
