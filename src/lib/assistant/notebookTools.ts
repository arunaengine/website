// Tools that act on the notebook that is open. They are offered only while the
// notebook page is open, and every write asks through the approval gate.
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from 'ai'
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
    if (always || gate.enabled()) {
      const approved = await gate.ask({ id: toolCallId, name, input }, always)
      if (!approved) return denied()
    }
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
        cpu_cores: { type: 'number' },
        ram_gb: { type: 'number' },
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
