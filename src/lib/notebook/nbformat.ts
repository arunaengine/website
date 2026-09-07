// The notebook document: nbformat 4 as the portal keeps it in memory, plus the
// reader and writer for the .ipynb file in the workspace bucket. Plain Jupyter
// opens the same file; everything the portal adds lives under metadata.aruna.

export const NBFORMAT_MAJOR = 4
export const NBFORMAT_MINOR = 5

export type CellKind = 'code' | 'markdown' | 'raw'

/** One nbformat output, in the shapes the session sends. */
export type NotebookOutput =
  | { output_type: 'stream'; name: string; text: string }
  | { output_type: 'display_data'; data: Record<string, unknown>; metadata?: Record<string, unknown> }
  | {
      output_type: 'execute_result'
      execution_count: number | null
      data: Record<string, unknown>
      metadata?: Record<string, unknown>
    }
  | { output_type: 'error'; ename: string; evalue: string; traceback: string[] }

/** One file staged into the workspace bucket for this cell. */
export interface CellInputRef {
  dest_key: string
  source_node_id?: string
  version_id?: string
  blake3?: string
}

export interface CellAruna {
  /** Only a pipeline cell carries a kind; a plain raw cell has none. */
  kind?: 'pipeline'
  job_id?: string
  started_at_ms?: number
  finished_at_ms?: number
  inputs?: CellInputRef[]
}

export interface NotebookCell {
  id: string
  cell_type: CellKind
  source: string
  /** Code cells only; other kinds keep it empty. */
  outputs: NotebookOutput[]
  execution_count: number | null
  metadata: Record<string, unknown> & { aruna?: CellAruna }
  attachments?: Record<string, Record<string, unknown>>
}

export interface NotebookDependencies {
  kind: 'requirements' | 'conda' | 'deno'
  text: string
}

export interface NotebookResources {
  cpu_cores?: number
  ram_bytes?: number
  disk_bytes?: number
}

export interface NotebookPlacement {
  node?: string
  executor_kind?: string
  labels?: Record<string, string>
}

export interface NotebookAruna {
  version: 1
  runtime: string
  workspace_bucket: string
  group_id: string
  job_id?: string
  executor_node_id?: string
  dependencies?: NotebookDependencies
  resources?: NotebookResources
  placement?: NotebookPlacement
}

export interface Notebook {
  cells: NotebookCell[]
  metadata: Record<string, unknown> & { aruna: NotebookAruna }
  nbformat: number
  nbformat_minor: number
}

/** Cell ids are 1 to 64 characters of [A-Za-z0-9_-], the session id too. */
export const CELL_ID = /^[A-Za-z0-9_-]{1,64}$/

export function newCellId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12)
}

export function newCell(kind: CellKind, source = ''): NotebookCell {
  return { id: newCellId(), cell_type: kind, source, outputs: [], execution_count: null, metadata: {} }
}

export function emptyNotebook(aruna: NotebookAruna): Notebook {
  return {
    cells: [newCell('code')],
    metadata: { aruna },
    nbformat: NBFORMAT_MAJOR,
    nbformat_minor: NBFORMAT_MINOR,
  }
}

// nbformat writes a multiline string either as one string or as a list of
// lines; both are read here so a file written by Jupyter opens unchanged.
export function multilineText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((line) => (typeof line === 'string' ? line : '')).join('')
  return ''
}

function readOutput(value: unknown): NotebookOutput | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const type = record.output_type
  if (type === 'stream') {
    return {
      output_type: 'stream',
      name: typeof record.name === 'string' ? record.name : 'stdout',
      text: multilineText(record.text),
    }
  }
  if (type === 'display_data' || type === 'execute_result') {
    const data = (record.data && typeof record.data === 'object' ? record.data : {}) as Record<string, unknown>
    const metadata = (record.metadata && typeof record.metadata === 'object' ? record.metadata : undefined) as
      | Record<string, unknown>
      | undefined
    if (type === 'display_data') return { output_type: 'display_data', data, metadata }
    return {
      output_type: 'execute_result',
      execution_count: typeof record.execution_count === 'number' ? record.execution_count : null,
      data,
      metadata,
    }
  }
  if (type === 'error') {
    const traceback = Array.isArray(record.traceback)
      ? record.traceback.map((line) => (typeof line === 'string' ? line : String(line)))
      : []
    return {
      output_type: 'error',
      ename: typeof record.ename === 'string' ? record.ename : 'Error',
      evalue: typeof record.evalue === 'string' ? record.evalue : '',
      traceback,
    }
  }
  return null
}

function readCell(value: unknown): NotebookCell | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const kind = record.cell_type
  if (kind !== 'code' && kind !== 'markdown' && kind !== 'raw') return null
  const metadata = (record.metadata && typeof record.metadata === 'object' ? record.metadata : {}) as
    Record<string, unknown> & { aruna?: CellAruna }
  const outputs = Array.isArray(record.outputs)
    ? record.outputs.flatMap((entry) => {
        const output = readOutput(entry)
        return output ? [output] : []
      })
    : []
  return {
    // An id a session would refuse is replaced rather than carried along.
    id: typeof record.id === 'string' && CELL_ID.test(record.id) ? record.id : newCellId(),
    cell_type: kind,
    source: multilineText(record.source),
    outputs,
    execution_count: typeof record.execution_count === 'number' ? record.execution_count : null,
    metadata,
    ...(record.attachments && typeof record.attachments === 'object' && !Array.isArray(record.attachments)
      ? { attachments: record.attachments as Record<string, Record<string, unknown>> }
      : {}),
  }
}

function readAruna(value: unknown, defaults: Partial<NotebookAruna>): NotebookAruna {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    ...record,
    version: 1,
    runtime: typeof record.runtime === 'string' && record.runtime ? record.runtime : (defaults.runtime ?? ''),
    workspace_bucket: typeof record.workspace_bucket === 'string' && record.workspace_bucket ? record.workspace_bucket : (defaults.workspace_bucket ?? ''),
    group_id: typeof record.group_id === 'string' && record.group_id ? record.group_id : (defaults.group_id ?? ''),
    job_id: typeof record.job_id === 'string' ? record.job_id : undefined,
    executor_node_id: typeof record.executor_node_id === 'string' ? record.executor_node_id : undefined,
    dependencies: record.dependencies && typeof record.dependencies === 'object' ? record.dependencies as NotebookDependencies : undefined,
    resources: record.resources && typeof record.resources === 'object' ? record.resources as NotebookResources : undefined,
    placement: record.placement && typeof record.placement === 'object' ? record.placement as NotebookPlacement : undefined,
  }
}

/** Reads a stored .ipynb file. Throws only when the text is not JSON. */
export function parseNotebook(text: string, defaults: Partial<NotebookAruna> = {}): Notebook {
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object') throw new Error('This file does not hold a notebook.')
  const record = parsed as Record<string, unknown>
  const metadata = (record.metadata && typeof record.metadata === 'object' ? record.metadata : {}) as
    Record<string, unknown>
  const cells = Array.isArray(record.cells)
    ? record.cells.flatMap((entry) => {
        const cell = readCell(entry)
        return cell ? [cell] : []
      })
    : []
  return {
    cells: cells.length ? cells : [newCell('code')],
    metadata: { ...metadata, aruna: readAruna(metadata.aruna, defaults) },
    nbformat: typeof record.nbformat === 'number' ? record.nbformat : NBFORMAT_MAJOR,
    nbformat_minor: typeof record.nbformat_minor === 'number' ? record.nbformat_minor : NBFORMAT_MINOR,
  }
}

function writeCell(cell: NotebookCell): Record<string, unknown> {
  const written: Record<string, unknown> = {
    id: cell.id,
    cell_type: cell.cell_type,
    metadata: cell.metadata,
    source: cell.source,
    ...(cell.attachments ? { attachments: cell.attachments } : {}),
  }
  if (cell.cell_type === 'code') {
    written.outputs = cell.outputs
    written.execution_count = cell.execution_count
  }
  return written
}

export function serializeNotebook(notebook: Notebook): string {
  return `${JSON.stringify(
    {
      cells: notebook.cells.map(writeCell),
      metadata: notebook.metadata,
      nbformat: notebook.nbformat,
      nbformat_minor: notebook.nbformat_minor,
    },
    null,
    1,
  )}\n`
}

export function isPipelineCell(cell: NotebookCell): boolean {
  return cell.cell_type === 'raw' && cell.metadata.aruna?.kind === 'pipeline'
}

/** The plain text of an output, for copying and for a text-only fallback. */
export function outputText(output: NotebookOutput): string {
  if (output.output_type === 'stream') return output.text
  if (output.output_type === 'error') return [output.evalue, ...output.traceback].join('\n')
  const plain = output.data['text/plain']
  if (typeof plain === 'string') return plain
  if (Array.isArray(plain)) return plain.join('')
  return ''
}
