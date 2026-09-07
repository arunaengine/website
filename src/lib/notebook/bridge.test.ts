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
  const meta = ref<NotebookAruna>({ ...aruna })
  const patchMeta = vi.fn((patch) => { Object.assign(meta.value, patch) })
  const setSource = vi.fn((id: string, source: string) => {
    const cell = cells.value.find((entry) => entry.id === id)
    if (cell) cell.source = source
  })
  const runCell = vi.fn(async () => true)
  const notebook = {
    scope: ref('scope-a'), generation: ref(1), patchMeta,
    name: computed(() => 'counts'),
    bucket: ref('lab-data'),
    key: ref('notebooks/counts.ipynb'),
    meta,
    cells: computed(() => cells.value),
    cellById: (id: string) => cells.value.find((cell) => cell.id === id),
    setSource,
    addCell: vi.fn((kind, index, source) => { const cell = newCell(kind, source); cells.value.splice(index ?? cells.value.length, 0, cell); return cell }),
    selectCell: vi.fn(), removeCell: vi.fn(), moveCell: vi.fn(), setCellType: vi.fn(),
    save: vi.fn(async () => true), dirty: ref(false), saveError: ref(null), capture: vi.fn(async () => 'snapshot'),
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
  return { bridge: createNotebookBridge(notebook, session), code, text, setSource, runCell, meta, patchMeta, notebook, session }
}

describe('createNotebookBridge', () => {
  it('changes its approval scope for a new notebook or kernel', () => {
    const { bridge, notebook, session } = doubles()
    const first = bridge.scope()
    notebook.generation.value += 1
    expect(bridge.scope()).not.toBe(first)
    const second = bridge.scope()
    session.jobId.value = 'another-kernel'
    expect(bridge.scope()).not.toBe(second)
  })

  it.each([
    { runtime: 'deno-notebook', dependency_kind: 'conda' as const, dependencies: 'dependencies: [numpy]' },
    { runtime: 'deno-notebook', cpu_cores: 0 },
    { cpu_cores: 2.5 },
    { ram_gb: -1 },
  ])('refuses invalid kernel settings without a partial change: %j', (patch) => {
    const { bridge, meta, patchMeta } = doubles()
    expect(bridge.setKernel(patch)).not.toBeNull()
    expect(patchMeta).not.toHaveBeenCalled()
    expect(meta.value).toEqual(aruna)
  })

  it('keeps an empty kernel patch unchanged', () => {
    const { bridge, patchMeta } = doubles()
    expect(bridge.setKernel({})).toBeNull()
    expect(patchMeta).not.toHaveBeenCalled()
  })

  it('accepts compatible dependencies in one metadata change', () => {
    const { bridge, meta, patchMeta } = doubles()
    expect(bridge.setKernel({ runtime: 'deno-notebook', dependency_kind: 'deno', dependencies: '{"imports":{}}', cpu_cores: 4, ram_gb: 8 })).toBeNull()
    expect(patchMeta).toHaveBeenCalledTimes(1)
    expect(meta.value).toMatchObject({ runtime: 'deno-notebook', dependencies: { kind: 'deno' }, resources: { cpu_cores: 4, ram_bytes: 8_000_000_000 } })
  })


  it('constructs portable Bash cells after the requested cell and guards conversions', () => {
    const { bridge, notebook, code, text } = doubles()
    expect(bridge.addCell('bash', 'echo hello', code.id)).toBeNull()
    expect(notebook.addCell).toHaveBeenCalledWith('code', 1, '%%bash\necho hello', undefined)
    expect(bridge.addCell('markdown', '# Plan', 'missing')).toContain('no cell')
    expect(bridge.setCellType(code.id, 'pipeline')).toContain('empty cell')
    expect(bridge.moveCell(text.id, -1)).toBeNull()
    expect(notebook.moveCell).toHaveBeenCalledWith(text.id, -1)
  })

  it('refuses destructive edits to a running cell', () => {
    const { bridge, notebook, session, code, setSource } = doubles({ live: true })
    session.cellStates.value[code.id].state = 'running'
    expect(bridge.removeCell(code.id)).toContain('finish')
    expect(bridge.editCell(code.id, 'replacement')).toContain('finish')
    expect(notebook.removeCell).not.toHaveBeenCalled()
    expect(setSource).not.toHaveBeenCalled()
  })

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
