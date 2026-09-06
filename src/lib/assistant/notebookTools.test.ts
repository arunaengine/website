import { describe, expect, it, vi } from 'vitest'
import { notebookTools, type NotebookBridge } from './notebookTools'
import { DENIAL_MESSAGE, type ApprovalGate } from './types'
import { runTool } from '@/test/aiTool'
import type { ToolSet } from 'ai'

function bridge(): NotebookBridge {
  return {
    summary: () => ({
      name: 'counts',
      bucket: 'lab-data',
      key: 'notebooks/counts.ipynb',
      runtime: 'python-notebook',
      workspace_bucket: 'lab-data',
      session: { state: 'ready', kernel: 'idle', job_id: '01JOB' },
      cells: [{ cell_id: 'c1', kind: 'code', source: 'print(1)', outputs: 0 }],
    }),
    editCell: vi.fn(() => null),
    runCell: vi.fn(async () => null),
    readOutputs: vi.fn(() => ({ cell_id: 'c1', outputs: [] })),
  }
}

function gate(answer: boolean, enabled: boolean) {
  const asked: Array<{ name: string; always: boolean }> = []
  const value: ApprovalGate = {
    enabled: () => enabled,
    ask: async (request, always) => {
      asked.push({ name: request.name, always })
      return answer
    },
  }
  return { gate: value, asked }
}

function call(tools: ToolSet, name: string, input: Record<string, unknown>) {
  return runTool(tools[name], input)
}

describe('notebookTools', () => {
  it('asks before running a cell even with the gate off', async () => {
    const api = bridge()
    const { gate: value, asked } = gate(true, false)
    await call(notebookTools(api, value), 'run_notebook_cell', { cell_id: 'c1' })
    expect(asked).toEqual([{ name: 'run_notebook_cell', always: true }])
    expect(api.runCell).toHaveBeenCalledWith('c1')
  })

  it('does not run a cell the user refused', async () => {
    const api = bridge()
    const { gate: value } = gate(false, false)
    const result = await call(notebookTools(api, value), 'run_notebook_cell', { cell_id: 'c1' })
    expect(result).toEqual({ error: DENIAL_MESSAGE })
    expect(api.runCell).not.toHaveBeenCalled()
  })

  it('edits a cell without asking while the gate is off', async () => {
    const api = bridge()
    const { gate: value, asked } = gate(true, false)
    await call(notebookTools(api, value), 'edit_notebook_cell', { cell_id: 'c1', source: 'print(2)' })
    expect(asked).toEqual([])
    expect(api.editCell).toHaveBeenCalledWith('c1', 'print(2)')
  })

  it('reads the notebook and the outputs of a cell without asking', async () => {
    const api = bridge()
    const { gate: value, asked } = gate(true, true)
    const summary = await call(notebookTools(api, value), 'read_notebook', {})
    expect(summary).toMatchObject({ name: 'counts' })
    await call(notebookTools(api, value), 'read_notebook_outputs', { cell_id: 'c1' })
    expect(api.readOutputs).toHaveBeenCalledWith('c1')
    expect(asked).toEqual([])
  })
})
