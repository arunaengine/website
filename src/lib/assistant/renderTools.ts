// Tools that draw in the conversation: a table, a chart, a row of numbers or
// a dataset card. They answer the model with a short acknowledgement and hand
// the card to the message, so the model moves on instead of echoing data.
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from 'ai'
import type { PreviewKind } from '@/composables/useObjectPreview'
import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'
import { errorMessage } from '@/lib/utils'
import type {
  ChartKind,
  JobOutputRef,
  JobView,
  ObjectView,
  RenderView,
  TimelineEvent,
  TreeEntry,
} from './types'

export const RENDER_TOOL_NAMES = [
  'show_table',
  'show_chart',
  'show_stats',
  'show_crate',
  'show_artifact',
  'show_job',
  'show_object',
  'show_tree',
  'show_timeline',
  'show_code',
  'show_diff',
] as const

/** One stored object to show, as a job output or a stat_object result names it. */
export interface ArtifactRef {
  bucket: string
  key: string
  versionId?: string
  nodeId?: string
  endpointUrl?: string
  contentType?: string
  filename?: string
  size?: number
}

/** What the host fetched: a URL the browser can show and how to show it. */
export interface LoadedArtifact {
  url: string
  contentType: string
  kind: PreviewKind
  name: string
  size?: number
  /** The text of a readable file, so the card needs no second fetch. */
  text?: string
}

export interface RenderHost {
  /** Keeps the card beside the tool call so the message can draw it. */
  keep: (toolCallId: string, view: RenderView) => void
  /** Fetches a stored dataset's RO-Crate by document id. */
  loadCrate: (documentId: string) => Promise<unknown>
  /** Fetches one stored object for a card; bytes never reach the model. */
  loadArtifact: (ref: ArtifactRef) => Promise<LoadedArtifact>
}

interface TableInput {
  title: string
  columns: string[]
  rows: unknown[][]
  bucket?: string
}

interface ChartInput {
  title: string
  kind: ChartKind
  labels: string[]
  series: Array<{ name?: string; values: number[] }>
}

interface StatsInput {
  title: string
  items: Array<{ label: string; value: string | number; hint?: string }>
}

interface CrateInput {
  document_id?: string
  rocrate?: unknown
}

interface JobInput {
  job_id: string
  state: string
  title?: string
  kind?: string
  submitted_at?: string
  started_at?: string
  finished_at?: string
  node_id?: string
  attempts?: number
  error?: string
  outputs?: Array<{ bucket?: string; key?: string; size?: number }>
}

interface ObjectInput {
  bucket: string
  key: string
  caption?: string
  content_type?: string
  version_id?: string
  last_modified?: string
  node_id?: string
  size?: number
}

interface ArtifactInput {
  bucket: string
  key: string
  version_id?: string
  node_id?: string
  endpoint_url?: string
  content_type?: string
  filename?: string
  size?: number
  job_id?: string
  caption?: string
}

interface TreeInput {
  title: string
  bucket?: string
  entries: Array<{ path?: string; kind?: string; size?: number }>
}

interface TimelineInput {
  title: string
  events: Array<{ at?: string | number; label?: string; detail?: string; state?: string }>
}

interface CodeInput {
  title: string
  language: string
  code: string
  caption?: string
}

interface DiffInput {
  title: string
  before: string
  after: string
  before_label?: string
  after_label?: string
}

const MAX_ROWS = 500
const MAX_POINTS = 200
const MAX_OUTPUTS = 50
const MAX_ENTRIES = 500
const MAX_EVENTS = 200
const MAX_TEXT_CHARS = 20_000
const MAX_DIFF_LINES = 300

function schema<INPUT>(properties: Record<string, unknown>, required: string[]) {
  return jsonSchema<INPUT>({ type: 'object', properties, required } as JSONSchema7)
}

const STRING = { type: 'string' } as const
const STRINGS = { type: 'array', items: STRING } as const

function strings(values: unknown[]): string[] {
  return values.map((value) => (typeof value === 'string' ? value : String(value ?? '')))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function count(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

/** An ISO instant from an ISO string or epoch milliseconds; '' when unusable. */
function instant(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : value
  const at = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw
  if (typeof at !== 'string' && typeof at !== 'number') return ''
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

/** The first `limit` lines of a text, so a comparison stays cheap to compute. */
function firstLines(value: unknown, limit: number): string {
  if (typeof value !== 'string') return ''
  return value.slice(0, MAX_TEXT_CHARS).split('\n').slice(0, limit).join('\n')
}

function crateTitle(crate: unknown): string {
  const graph = crateGraph(crate)
  const rootId = crateRootId(crate)
  const root = graph.find((entity) => entity['@id'] === rootId) ?? graph.find((entity) => entity['@id'] === './')
  return stringProp(root?.name) ?? 'Dataset'
}

export function renderTools(host: RenderHost): ToolSet {
  return {
    show_table: tool({
      description:
        'Shows a sortable table in the conversation. Use it for any tabular data instead of writing it out. '
        + 'When the rows are about stored objects, pass the bucket they are in so every file name links.',
      inputSchema: schema<TableInput>({
        title: STRING,
        columns: STRINGS,
        rows: { type: 'array', items: { type: 'array', items: {} } },
        bucket: STRING,
      }, ['title', 'columns', 'rows']),
      execute: (input, { toolCallId }) => {
        const columns = strings(input.columns ?? [])
        if (!columns.length) return { error: 'A table needs at least one column.' }
        const rows = (input.rows ?? []).slice(0, MAX_ROWS).map((row) => (Array.isArray(row) ? row : [row]))
        host.keep(toolCallId, { kind: 'table', title: input.title, columns, rows, bucket: text(input.bucket) || undefined })
        return { shown: true, rows: rows.length, truncated: (input.rows?.length ?? 0) > MAX_ROWS }
      },
    }),

    show_chart: tool({
      description: 'Shows a bar, line or pie chart in the conversation. Every series has one value per label.',
      inputSchema: schema<ChartInput>({
        title: STRING,
        kind: { type: 'string', enum: ['bar', 'line', 'pie'] },
        labels: STRINGS,
        series: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: STRING, values: { type: 'array', items: { type: 'number' } } },
            required: ['values'],
          },
        },
      }, ['title', 'kind', 'labels', 'series']),
      execute: (input, { toolCallId }) => {
        const labels = strings(input.labels ?? []).slice(0, MAX_POINTS)
        const series = (input.series ?? []).map((entry, index) => ({
          name: entry.name?.trim() || `Series ${index + 1}`,
          values: (entry.values ?? []).slice(0, labels.length).map((value) => Number(value)),
        })).filter((entry) => entry.values.length)
        if (!labels.length || !series.length) return { error: 'A chart needs labels and at least one series of numbers.' }
        if (series.some((entry) => entry.values.some((value) => !Number.isFinite(value)))) {
          return { error: 'Every value in a series must be a finite number.' }
        }
        host.keep(toolCallId, { kind: 'chart', title: input.title, chart: input.kind, labels, series })
        return { shown: true }
      },
    }),

    show_stats: tool({
      description: 'Shows a row of labelled numbers (stat tiles) in the conversation.',
      inputSchema: schema<StatsInput>({
        title: STRING,
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: STRING, value: {}, hint: STRING },
            required: ['label', 'value'],
          },
        },
      }, ['title', 'items']),
      execute: (input, { toolCallId }) => {
        const items = (input.items ?? []).map((item) => ({
          label: String(item.label ?? ''),
          value: String(item.value ?? ''),
          ...(item.hint ? { hint: String(item.hint) } : {}),
        })).filter((item) => item.label)
        if (!items.length) return { error: 'Stats need at least one labelled value.' }
        host.keep(toolCallId, { kind: 'stats', title: input.title, items })
        return { shown: true }
      },
    }),

    show_crate: tool({
      description:
        'Shows a dataset card in the conversation: pass a stored document_id, or an RO-Crate JSON-LD object.',
      inputSchema: schema<CrateInput>({ document_id: STRING, rocrate: { type: 'object' } }, []),
      execute: async (input, { toolCallId }) => {
        try {
          const crate = input.document_id ? await host.loadCrate(input.document_id) : input.rocrate
          if (!crate || typeof crate !== 'object') return { error: 'Pass a document_id or an RO-Crate object.' }
          const title = crateTitle(crate)
          host.keep(toolCallId, {
            kind: 'crate',
            title,
            ...(input.document_id ? { documentId: input.document_id } : {}),
            crate,
          })
          return { shown: true, name: title, ...(input.document_id ? { document_id: input.document_id } : {}) }
        } catch (cause) {
          return { error: errorMessage(cause) }
        }
      },
    }),

    show_job: tool({
      description:
        'Shows a job card in the conversation: its state, when it ran, the node that ran it and links to the '
        + 'files it wrote. Use it for every job submission and every job status answer instead of writing the '
        + 'status as text. Pass the job id and the fields get_job returned.',
      inputSchema: schema<JobInput>({
        job_id: STRING,
        state: STRING,
        title: STRING,
        kind: STRING,
        submitted_at: STRING,
        started_at: STRING,
        finished_at: STRING,
        node_id: STRING,
        attempts: { type: 'number' },
        error: STRING,
        outputs: {
          type: 'array',
          items: {
            type: 'object',
            properties: { bucket: STRING, key: STRING, size: { type: 'number' } },
            required: ['bucket', 'key'],
          },
        },
      }, ['job_id', 'state']),
      execute: (input, { toolCallId }) => {
        const jobId = text(input.job_id)
        const state = text(input.state)
        if (!jobId || !state) return { error: 'A job card needs a job id and its state; call get_job first.' }
        const outputs: JobOutputRef[] = (input.outputs ?? [])
          .slice(0, MAX_OUTPUTS)
          .flatMap((output) => {
            const bucket = text(output.bucket)
            const key = text(output.key)
            return bucket && key ? [{ bucket, key, ...(count(output.size) !== undefined ? { size: count(output.size) } : {}) }] : []
          })
        const view: JobView = {
          kind: 'job',
          title: text(input.title) || `Job ${jobId}`,
          jobId,
          state,
          ...(text(input.kind) ? { jobKind: text(input.kind) } : {}),
          ...(text(input.submitted_at) ? { submittedAt: text(input.submitted_at) } : {}),
          ...(text(input.started_at) ? { startedAt: text(input.started_at) } : {}),
          ...(text(input.finished_at) ? { finishedAt: text(input.finished_at) } : {}),
          ...(text(input.node_id) ? { nodeId: text(input.node_id) } : {}),
          ...(count(input.attempts) !== undefined ? { attempts: count(input.attempts) } : {}),
          ...(text(input.error) ? { error: text(input.error) } : {}),
          outputs,
        }
        host.keep(toolCallId, view)
        return { shown: true, state, outputs: outputs.length }
      },
    }),

    show_object: tool({
      description:
        'Shows one stored object as a card: where it lives, its size, type, version and when it changed, linked '
        + 'into the data browser. Use it after writing, copying or looking up a single object instead of listing '
        + 'those facts as text. Pass only the facts you know.',
      inputSchema: schema<ObjectInput>({
        bucket: STRING,
        key: STRING,
        caption: STRING,
        content_type: STRING,
        version_id: STRING,
        last_modified: STRING,
        node_id: STRING,
        size: { type: 'number' },
      }, ['bucket', 'key']),
      execute: (input, { toolCallId }) => {
        const bucket = text(input.bucket)
        const key = text(input.key)
        if (!bucket || !key) return { error: 'An object card needs a bucket and a key.' }
        const view: ObjectView = {
          kind: 'object',
          bucket,
          key,
          ...(text(input.caption) ? { caption: text(input.caption) } : {}),
          ...(text(input.content_type) ? { contentType: text(input.content_type) } : {}),
          ...(text(input.version_id) ? { versionId: text(input.version_id) } : {}),
          ...(text(input.last_modified) ? { lastModified: text(input.last_modified) } : {}),
          ...(text(input.node_id) ? { nodeId: text(input.node_id) } : {}),
          ...(count(input.size) !== undefined ? { size: count(input.size) } : {}),
        }
        host.keep(toolCallId, view)
        return { shown: true }
      },
    }),

    show_tree: tool({
      description:
        'Shows a bucket or folder listing as a nested tree. Pass the flat paths from list_objects; the card builds '
        + 'the nesting. Pass the bucket so every file links into the data browser.',
      inputSchema: schema<TreeInput>({
        title: STRING,
        bucket: STRING,
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: { path: STRING, kind: { type: 'string', enum: ['file', 'folder'] }, size: { type: 'number' } },
            required: ['path', 'kind'],
          },
        },
      }, ['title', 'entries']),
      execute: (input, { toolCallId }) => {
        const all: TreeEntry[] = (input.entries ?? []).flatMap((entry) => {
          const path = text(entry.path).replace(/^\/+/, '').replace(/\/+$/, '')
          const size = count(entry.size)
          if (!path) return []
          return [{
            path,
            kind: entry.kind === 'folder' ? 'folder' : 'file',
            ...(size !== undefined ? { size } : {}),
          }]
        })
        if (!all.length) return { error: 'A tree needs at least one entry with a path.' }
        const entries = all.slice(0, MAX_ENTRIES)
        const dropped = all.length - entries.length
        const bucket = text(input.bucket)
        host.keep(toolCallId, {
          kind: 'tree',
          title: input.title,
          entries,
          ...(bucket ? { bucket } : {}),
          ...(dropped ? { dropped } : {}),
        })
        return { shown: true, entries: entries.length, truncated: dropped > 0 }
      },
    }),

    show_timeline: tool({
      description:
        'Shows dated events in order: a job\'s history, an object\'s versions, or a sync\'s activity. Each event '
        + 'takes a time as an ISO string or epoch milliseconds, a short label, an optional detail line and an '
        + 'optional state such as running or succeeded.',
      inputSchema: schema<TimelineInput>({
        title: STRING,
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: { at: {}, label: STRING, detail: STRING, state: STRING },
            required: ['at', 'label'],
          },
        },
      }, ['title', 'events']),
      execute: (input, { toolCallId }) => {
        const all: TimelineEvent[] = (input.events ?? []).flatMap((event) => {
          const at = instant(event.at)
          const label = text(event.label)
          if (!at || !label) return []
          return [{
            at,
            label,
            ...(text(event.detail) ? { detail: text(event.detail) } : {}),
            ...(text(event.state) ? { state: text(event.state) } : {}),
          }]
        }).sort((a, b) => a.at.localeCompare(b.at))
        if (!all.length) return { error: 'A timeline needs at least one event with a valid time and a label.' }
        const events = all.slice(0, MAX_EVENTS)
        host.keep(toolCallId, { kind: 'timeline', title: input.title, events })
        return { shown: true, events: events.length, truncated: all.length > MAX_EVENTS }
      },
    }),

    show_code: tool({
      description:
        'Shows a code, query or config block, highlighted and read-only, with a copy button. Use it for a script, '
        + 'a SPARQL query or a snippet you wrote instead of a fenced block in the answer.',
      inputSchema: schema<CodeInput>({
        title: STRING,
        language: STRING,
        code: STRING,
        caption: STRING,
      }, ['title', 'language', 'code']),
      execute: (input, { toolCallId }) => {
        const code = typeof input.code === 'string' ? input.code : ''
        if (!code.trim()) return { error: 'A code card needs the code to show.' }
        const caption = text(input.caption)
        host.keep(toolCallId, {
          kind: 'code',
          title: input.title,
          language: text(input.language).toLowerCase() || 'text',
          code: code.slice(0, MAX_TEXT_CHARS),
          ...(caption ? { caption } : {}),
        })
        return { shown: true, truncated: code.length > MAX_TEXT_CHARS }
      },
    }),

    show_diff: tool({
      description:
        'Compares two texts line by line: two object versions, two config values, or a draft against what is '
        + 'stored. Pass a label for each side when "Before" and "After" would not be clear.',
      inputSchema: schema<DiffInput>({
        title: STRING,
        before: STRING,
        after: STRING,
        before_label: STRING,
        after_label: STRING,
      }, ['title', 'before', 'after']),
      execute: (input, { toolCallId }) => {
        const before = firstLines(input.before, MAX_DIFF_LINES)
        const after = firstLines(input.after, MAX_DIFF_LINES)
        if (!before && !after) return { error: 'A comparison needs a before and an after text.' }
        host.keep(toolCallId, {
          kind: 'diff',
          title: input.title,
          before,
          after,
          beforeLabel: text(input.before_label) || 'Before',
          afterLabel: text(input.after_label) || 'After',
        })
        return { shown: true, changed: before !== after }
      },
    }),

    show_artifact: tool({
      description:
        'Shows a stored object in the conversation: an image, a text, JSON or CSV file, or a download row for '
        + 'anything else. Pass a job output from list_job_outputs, or any bucket and key. The file itself is shown '
        + 'to the user, so never paste its bytes into the answer.',
      inputSchema: schema<ArtifactInput>({
        bucket: STRING,
        key: STRING,
        version_id: STRING,
        node_id: STRING,
        endpoint_url: STRING,
        content_type: STRING,
        filename: STRING,
        size: { type: 'number' },
        job_id: STRING,
        caption: STRING,
      }, ['bucket', 'key']),
      execute: async (input, { toolCallId }) => {
        const bucket = text(input.bucket)
        const key = text(input.key)
        if (!bucket || !key) return { error: 'An artifact needs a bucket and a key.' }
        const versionId = text(input.version_id)
        const jobId = text(input.job_id)
        const caption = text(input.caption)
        try {
          const loaded = await host.loadArtifact({
            bucket,
            key,
            versionId: versionId || undefined,
            nodeId: text(input.node_id) || undefined,
            endpointUrl: text(input.endpoint_url) || undefined,
            contentType: text(input.content_type) || undefined,
            filename: text(input.filename) || undefined,
            size: count(input.size),
          })
          host.keep(toolCallId, {
            kind: 'artifact',
            title: loaded.name,
            caption: caption || undefined,
            artifact: {
              url: loaded.url,
              contentType: loaded.contentType,
              previewKind: loaded.kind,
              name: loaded.name,
              size: loaded.size,
              bucket,
              key,
              versionId: versionId || undefined,
              jobId: jobId || undefined,
              text: loaded.text,
            },
          })
          return { shown: true, content_type: loaded.contentType, kind: loaded.kind }
        } catch (cause) {
          return { error: errorMessage(cause) }
        }
      },
    }),
  }
}
