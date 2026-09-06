import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createNotebookBridge } from './bridge'
import { newCell, type NotebookAruna, type NotebookCell } from './nbformat'
import type { NotebookStore } from '@/composables/useNotebook'
import type { NotebookSessionStore } from '@/composables/useNotebookSession'

const aruna: NotebookAruna = {
  version: 1,
  runtime: 'python-notebook',
  workspace_bucket: 'lab-data',
  group_id: 'group-1',
}

function doubles(options: { live?: boolean } = {}) {
  const code = newCell('code', 'print(1)')
  code.outputs = [{ output_type: 'stream', name: 'stdout', text: '1\n' }]
  const text = newCell('markdown', '# Title')
  const cells = ref<NotebookCell[]>([code, text])
  const setSource = vi.fn((id: string, source: string) => {
    const cell = cells.value.find((entry) => entry.id === id)
    if (cell) cell.source = source
  })
  const runCell = vi.fn(async () => true)
  const notebook = {
    name: computed(() => 'counts'),
    bucket: ref('lab-data'),
    key: ref('notebooks/counts.ipynb'),
    meta: computed(() => aruna),
    cells: computed(() => cells.value),
    cellById: (id: string) => cells.value.find((cell) => cell.id === id),
    setSource,
  } as unknown as NotebookStore
  const session = {
    state: ref(options.live ? { state: 'ready' } : null),
    kernel: ref(options.live ? 'idle' : 'starting'),
    jobId: ref(options.live ? '01JOB' : ''),
    cellStates: ref({ [code.id]: { cell_id: code.id, state: 'done' } }),
    live: computed(() => Boolean(options.live)),
    error: ref(null),
    runCell,
  } as unknown as NotebookSessionStore
  return { bridge: createNotebookBridge(notebook, session), code, text, setSource, runCell }
}

describe('createNotebookBridge', () => {
  it('reads the notebook and its cells', () => {
    const { bridge, code } = doubles({ live: true })
    const summary = bridge.summary()
    expect(summary).toMatchObject({
      name: 'counts',
      bucket: 'lab-data',
      workspace_bucket: 'lab-data',
      runtime: 'python-notebook',
      session: { state: 'ready', kernel: 'idle', job_id: '01JOB' },
    })
    expect(summary.cells[0]).toMatchObject({ cell_id: code.id, kind: 'code', source: 'print(1)', outputs: 1 })
    expect(summary.cells[1].kind).toBe('markdown')
  })

  it('edits one cell and refuses an unknown one', () => {
    const { bridge, code, setSource } = doubles()
    expect(bridge.editCell(code.id, 'print(2)')).toBeNull()
    expect(setSource).toHaveBeenCalledWith(code.id, 'print(2)')
    expect(bridge.editCell('nope', 'x')).toContain('no cell nope')
  })

  it('runs a code cell only while the session is live', async () => {
    const stopped = doubles()
    expect(await stopped.bridge.runCell(stopped.code.id)).toContain('not running')

    const live = doubles({ live: true })
    expect(await live.bridge.runCell(live.code.id)).toBeNull()
    expect(live.runCell).toHaveBeenCalledWith(live.code.id, 'print(1)')
    expect(await live.bridge.runCell(live.text.id)).toContain('code cell')
  })

  it('reads the outputs of one cell', () => {
    const { bridge, code } = doubles({ live: true })
    expect(bridge.readOutputs(code.id)).toEqual({
      cell_id: code.id,
      outputs: [{ type: 'stream', text: '1\n' }],
    })
    expect(bridge.readOutputs('nope')).toContain('no cell nope')
  })
})
