// Tools that act on the notebook that is open. They are offered only while the
// notebook page is open, and every write asks through the approval gate.
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from 'ai'
import type { NotebookCellType } from '@/lib/notebook/nbformat'
import { denied, type ApprovalGate } from './types'

export interface NotebookCellSummary {
  cell_id: string
  kind: string
  source: string
  /** What the session last reported about this cell, when it ran one. */
  state?: string
  execution_count?: number | null
  outputs: number
}

export interface NotebookSummary {
  name: string
  bucket: string
  key: string
  runtime: string
  workspace_bucket: string
  session: { state: string; kernel: string; job_id: string }
  cells: NotebookCellSummary[]
}

export interface NotebookOutputSummary {
  cell_id: string
  outputs: { type: string; text: string }[]
}

export interface KernelPatch {
  runtime?: string
  dependencies?: string
  dependency_kind?: 'requirements' | 'conda' | 'deno'
  cpu_cores?: number
  ram_gb?: number
}

/** The small API the notebook page lends the assistant while it is open. */
export interface NotebookBridge {
  scope: () => string
  addCell: (kind: NotebookCellType, source: string, after?: string) => string | null
  removeCell: (cellId: string) => string | null
  moveCell: (cellId: string, offset: number) => string | null
  setCellType: (cellId: string, kind: NotebookCellType) => string | null
  save: () => Promise<string | null>
  capture: () => Promise<string>
  summary: () => NotebookSummary
  startKernel: (restart: boolean) => Promise<string | null>
  stopKernel: () => Promise<string | null>
  setKernel: (patch: KernelPatch) => string | null
  editCell: (cellId: string, source: string) => string | null
  runCell: (cellId: string) => Promise<string | null>
  readOutputs: (cellId: string) => NotebookOutputSummary | string
}

function schema<INPUT>(properties: Record<string, unknown>, required: string[] = []) {
  return jsonSchema<INPUT>({ type: 'object', properties, required } as JSONSchema7)
}

const STRING = { type: 'string' } as const

export function notebookTools(bridge: NotebookBridge, gate: ApprovalGate): ToolSet {
  /** Runs one write: asks the gate first, then applies it. */
  async function write(
    name: string,
    toolCallId: string,
    input: Record<string, unknown>,
    apply: () => Promise<string | null> | (string | null),
    always = false,
  ) {
    const scope = bridge.scope()
    if (always || gate.enabled()) {
      const approved = await gate.ask({ id: toolCallId, name, input }, always)
      if (!approved) return denied()
    }
    if (scope !== bridge.scope()) return { error: 'The notebook or kernel changed while waiting for approval. Read the notebook and request the action again.' }
    const refusal = await apply()
    if (refusal) return { error: refusal }
    return bridge.summary()
  }

  return {
    read_notebook: tool({
      description:
        'Reads the notebook that is open: its runtime, the bucket it works in, the session state, and '
        + 'every cell with its text and how many outputs it holds.',
      inputSchema: schema<Record<string, never>>({}),
      execute: () => bridge.summary(),
    }),

    add_notebook_cell: tool({
      description: 'Adds a Code, Markdown, Bash, or Pipeline cell to the open notebook, optionally after another cell.',
      inputSchema: schema<{ kind: NotebookCellType; source?: string; after_cell_id?: string }>({ kind: { type: 'string', enum: ['code', 'markdown', 'bash', 'pipeline'] }, source: STRING, after_cell_id: STRING }, ['kind']),
      execute: (input, { toolCallId }) => write('add_notebook_cell', toolCallId, input, () => bridge.addCell(input.kind, input.source ?? '', input.after_cell_id)),
    }),
    remove_notebook_cell: tool({
      description: 'Removes a cell and its stored outputs from the open notebook.',
      inputSchema: schema<{ cell_id: string }>({ cell_id: STRING }, ['cell_id']),
      execute: (input, { toolCallId }) => write('remove_notebook_cell', toolCallId, input, () => bridge.removeCell(input.cell_id), true),
    }),
    move_notebook_cell: tool({
      description: 'Moves a cell by a signed offset: -1 moves up once and 1 moves down once.',
      inputSchema: schema<{ cell_id: string; offset: number }>({ cell_id: STRING, offset: { type: 'integer' } }, ['cell_id', 'offset']),
      execute: (input, { toolCallId }) => write('move_notebook_cell', toolCallId, input, () => bridge.moveCell(input.cell_id, input.offset)),
    }),
    set_notebook_cell_type: tool({
      description: 'Changes a cell type, preserving its source and clearing old outputs. Only an empty cell can become a Pipeline cell.',
      inputSchema: schema<{ cell_id: string; kind: NotebookCellType }>({ cell_id: STRING, kind: { type: 'string', enum: ['code', 'markdown', 'bash', 'pipeline'] } }, ['cell_id', 'kind']),
      execute: (input, { toolCallId }) => write('set_notebook_cell_type', toolCallId, input, () => bridge.setCellType(input.cell_id, input.kind)),
    }),
    save_notebook: tool({
      description: 'Saves the open notebook and its outputs to its existing bucket location.',
      inputSchema: schema<Record<string, never>>({}),
      execute: (input, { toolCallId }) => write('save_notebook', toolCallId, input, () => bridge.save()),
    }),
    capture_notebook: tool({
      description: 'Creates a private run-crate snapshot of the notebook and embedded outputs without stopping its kernel. Returns the dataset id.',
      inputSchema: schema<Record<string, never>>({}),
      execute: async (input, { toolCallId }) => {
        let documentId = ''
        const result = await write('capture_notebook', toolCallId, input, async () => { documentId = await bridge.capture(); return null }, true)
        return 'error' in result ? result : { ...result, document_id: documentId }
      },
    }),

    edit_notebook_cell: tool({
      description: 'Replaces the text of one cell. The cell keeps its outputs until it runs again.',
      inputSchema: schema<{ cell_id: string; source: string }>(
        { cell_id: STRING, source: STRING },
        ['cell_id', 'source'],
      ),
      execute: (input, { toolCallId }) =>
        write('edit_notebook_cell', toolCallId, input, () => bridge.editCell(input.cell_id, input.source)),
    }),

    set_notebook_kernel: tool({
      description:
        'Changes what the kernel runs on: its runtime, its dependency list (the whole file, one '
        + 'package per line for pip), and its CPU and RAM. The changes apply the next time the kernel starts.',
      inputSchema: schema<KernelPatch>({
        runtime: STRING,
        dependencies: STRING,
        dependency_kind: { type: 'string', enum: ['requirements', 'conda', 'deno'] },
        cpu_cores: { type: 'integer', minimum: 1, maximum: 4_294_967_295 },
        ram_gb: { type: 'number', exclusiveMinimum: 0, maximum: 9_223_372_036 },
      }),
      execute: (input, { toolCallId }) =>
        write('set_notebook_kernel', toolCallId, { ...input }, () => bridge.setKernel(input)),
    }),

    start_notebook_kernel: tool({
      description:
        'Starts the kernel of the open notebook, or restarts a running one with `restart`. A restart '
        + 'installs the saved dependencies again and clears every variable.',
      inputSchema: schema<{ restart?: boolean }>({ restart: { type: 'boolean' } }),
      // Starting a session spends compute, so it always asks.
      execute: (input, { toolCallId }) =>
        write('start_notebook_kernel', toolCallId, input, () => bridge.startKernel(input.restart === true), true),
    }),

    stop_notebook_kernel: tool({
      description: 'Ends the running session. Its variables are lost; the notebook and its files stay.',
      inputSchema: schema<Record<string, never>>({}),
      execute: (input, { toolCallId }) =>
        write('stop_notebook_kernel', toolCallId, input, () => bridge.stopKernel(), true),
    }),

    run_notebook_cell: tool({
      description: 'Runs one cell in the running session. Its outputs arrive on the notebook page.',
      inputSchema: schema<{ cell_id: string }>({ cell_id: STRING }, ['cell_id']),
      // Running a cell executes code with the session's own credential, so it
      // always asks, whatever the approval toggle says.
      execute: (input, { toolCallId }) =>
        write('run_notebook_cell', toolCallId, input, () => bridge.runCell(input.cell_id), true),
    }),

    read_notebook_outputs: tool({
      description: 'Reads what one cell produced: its text, error and result outputs.',
      inputSchema: schema<{ cell_id: string }>({ cell_id: STRING }, ['cell_id']),
      execute: (input) => {
        const outputs = bridge.readOutputs(input.cell_id)
        return typeof outputs === 'string' ? { error: outputs } : outputs
      },
    }),
  }
}
