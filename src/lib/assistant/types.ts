// What the chat panel renders and what the tool layer hands back to the model.
import type { PreviewKind } from '@/composables/useObjectPreview'

/** What a denied tool call answers the model, as NovaCrate words it. */
export const DENIAL_MESSAGE = 'The user has denied this operation'

export type ToolCallState = 'approval' | 'running' | 'done' | 'error' | 'denied'

export type ChartKind = 'bar' | 'line' | 'pie'

/** How much of a text file the card holds, so nothing huge is kept twice. */
export const ARTIFACT_TEXT_CAP = 200_000

// One stored object the chat shows. `url` is a blob URL for bytes already in
// the tab or a presigned URL for a download; a blob URL never survives a
// reload, so a restored card falls back to `text`.
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
  /** The file's own text, read from the bytes the tab already holds. */
  text?: string
}

/** One stored file a job wrote, as list_job_outputs names it. */
export interface JobOutputRef {
  bucket: string
  key: string
  size?: number
}

/** A submitted or polled job the assistant shows instead of writing it out. */
export interface JobView {
  kind: 'job'
  title: string
  jobId: string
  state: string
  jobKind?: string
  submittedAt?: string
  startedAt?: string
  finishedAt?: string
  nodeId?: string
  attempts?: number
  error?: string
  outputs: JobOutputRef[]
}

/** One entry of a listing: a stored object, or a folder above one. */
export interface TreeEntry {
  path: string
  kind: 'file' | 'folder'
  size?: number
}

/** A bucket or folder listing shown as a tree; the card builds the nesting. */
export interface TreeView {
  kind: 'tree'
  title: string
  entries: TreeEntry[]
  /** Set when every path is in one bucket, so files link into the browser. */
  bucket?: string
  /** How many entries were left out to stay under the cap. */
  dropped?: number
}

/** One dated step of a job, a version history or a sync. */
export interface TimelineEvent {
  at: string
  label: string
  detail?: string
  state?: string
}

/** Ordered events the assistant shows instead of writing a history as prose. */
export interface TimelineView {
  kind: 'timeline'
  title: string
  events: TimelineEvent[]
}

/** A code, query or config block, shown read-only and highlighted. */
export interface CodeView {
  kind: 'code'
  title: string
  language: string
  code: string
  caption?: string
}

/** Two texts compared line by line, such as two versions of one config. */
export interface DiffView {
  kind: 'diff'
  title: string
  before: string
  after: string
  beforeLabel: string
  afterLabel: string
}

/** One stored object the assistant shows instead of listing its facts as prose. */
export interface ObjectView {
  kind: 'object'
  bucket: string
  key: string
  /** A short line above the facts, such as what the write did. */
  caption?: string
  size?: number
  contentType?: string
  versionId?: string
  lastModified?: string
  nodeId?: string
}

/** What a render tool asked the conversation to show; kept beside the call. */
export type RenderView =
  | { kind: 'table'; title: string; columns: string[]; rows: unknown[][]; bucket?: string }
  | { kind: 'chart'; title: string; chart: ChartKind; labels: string[]; series: Array<{ name: string; values: number[] }> }
  | { kind: 'stats'; title: string; items: Array<{ label: string; value: string; hint?: string }> }
  | { kind: 'crate'; title: string; documentId?: string; crate: unknown }
  | { kind: 'artifact'; title: string; caption?: string; artifact: ArtifactView }
  | JobView
  | ObjectView
  | TreeView
  | TimelineView
  | CodeView
  | DiffView

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
  /** When the message was created, in epoch milliseconds. */
  at: number
  /** Set on an update the portal added for a watcher; not the person's words. */
  background?: true
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
