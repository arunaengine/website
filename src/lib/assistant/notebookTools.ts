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

/** The small API the notebook page lends the assistant while it is open. */
export interface NotebookBridge {
  summary: () => NotebookSummary
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
  ) {
    if (gate.enabled()) {
      const approved = await gate.ask({ id: toolCallId, name, input }, false)
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

    run_notebook_cell: tool({
      description: 'Runs one cell in the running session. Its outputs arrive on the notebook page.',
      inputSchema: schema<{ cell_id: string }>({ cell_id: STRING }, ['cell_id']),
      execute: (input, { toolCallId }) =>
        write('run_notebook_cell', toolCallId, input, () => bridge.runCell(input.cell_id)),
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
