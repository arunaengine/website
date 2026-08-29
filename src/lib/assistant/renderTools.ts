// Tools that draw in the conversation: a table, a chart, a row of numbers or
// a dataset card. They answer the model with a short acknowledgement and hand
// the card to the message, so the model moves on instead of echoing data.
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from 'ai'
import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'
import { errorMessage } from '@/lib/utils'
import type { ChartKind, RenderView } from './types'

export const RENDER_TOOL_NAMES = ['show_table', 'show_chart', 'show_stats', 'show_crate'] as const

export interface RenderHost {
  /** Keeps the card beside the tool call so the message can draw it. */
  keep: (toolCallId: string, view: RenderView) => void
  /** Fetches a stored dataset's RO-Crate by document id. */
  loadCrate: (documentId: string) => Promise<unknown>
}

interface TableInput {
  title: string
  columns: string[]
  rows: unknown[][]
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

const MAX_ROWS = 500
const MAX_POINTS = 200

function schema<INPUT>(properties: Record<string, unknown>, required: string[]) {
  return jsonSchema<INPUT>({ type: 'object', properties, required } as JSONSchema7)
}

const STRING = { type: 'string' } as const
const STRINGS = { type: 'array', items: STRING } as const

function strings(values: unknown[]): string[] {
  return values.map((value) => (typeof value === 'string' ? value : String(value ?? '')))
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
      description: 'Shows a sortable table in the conversation. Use it for any tabular data instead of writing it out.',
      inputSchema: schema<TableInput>({
        title: STRING,
        columns: STRINGS,
        rows: { type: 'array', items: { type: 'array', items: {} } },
      }, ['title', 'columns', 'rows']),
      execute: (input, { toolCallId }) => {
        const columns = strings(input.columns ?? [])
        if (!columns.length) return { error: 'A table needs at least one column.' }
        const rows = (input.rows ?? []).slice(0, MAX_ROWS).map((row) => (Array.isArray(row) ? row : [row]))
        host.keep(toolCallId, { kind: 'table', title: input.title, columns, rows })
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
  }
}
