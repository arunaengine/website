import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const s3 = vi.hoisted(() => ({ getObjectText: vi.fn(), putTextObject: vi.fn() }))
vi.mock('@/composables/useS3', () => ({ useS3: () => s3 }))

const { createNotebook } = await import('./useNotebook')
const { emptyNotebook, serializeNotebook } = await import('@/lib/notebook/nbformat')
const { readWorkingCopy } = await import('@/lib/notebook/document')

function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, value),
  }
}

const seed = () => ({ runtime: 'python-notebook', group_id: 'group-1' })

function store() {
  return createNotebook(ref('lab-data'), ref('notebooks/counts.ipynb'), seed)
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  s3.getObjectText.mockReset()
  s3.putTextObject.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createNotebook', () => {
  it('reads the stored notebook', async () => {
    const stored = emptyNotebook({
      version: 1,
      runtime: 'deno-notebook',
      workspace_bucket: 'lab-data',
      group_id: 'group-2',
    })
    stored.cells[0].source = 'print(1)'
    s3.getObjectText.mockResolvedValue(serializeNotebook(stored))
    const notebook = store()
    await notebook.load()
    expect(notebook.cells.value[0].source).toBe('print(1)')
    expect(notebook.meta.value?.runtime).toBe('deno-notebook')
    expect(notebook.isNew.value).toBe(false)
  })

  it('starts an empty notebook when the object is absent', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    const notebook = store()
    await notebook.load()
    expect(notebook.isNew.value).toBe(true)
    expect(notebook.cells.value).toHaveLength(1)
    expect(notebook.meta.value).toMatchObject({ runtime: 'python-notebook', workspace_bucket: 'lab-data' })
    expect(notebook.loadError.value).toBeNull()
  })

  it('keeps an edit in this browser until it is saved', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    s3.putTextObject.mockResolvedValue({ versionId: 'v1' })
    const notebook = store()
    await notebook.load()
    notebook.setSource(notebook.cells.value[0].id, 'print(2)')
    expect(notebook.dirty.value).toBe(true)
    expect(readWorkingCopy('lab-data', 'notebooks/counts.ipynb')?.text).toContain('print(2)')

    await notebook.save()
    expect(s3.putTextObject).toHaveBeenCalledOnce()
    expect(notebook.dirty.value).toBe(false)
    expect(readWorkingCopy('lab-data', 'notebooks/counts.ipynb')).toBeNull()
  })

  it('restores the unsaved copy when it differs from the stored file', async () => {
    const stored = emptyNotebook({
      version: 1,
      runtime: 'python-notebook',
      workspace_bucket: 'lab-data',
      group_id: 'group-1',
    })
    stored.cells[0].source = 'print(1)'
    s3.getObjectText.mockResolvedValue(serializeNotebook(stored))
    const unsaved = emptyNotebook({
      version: 1,
      runtime: 'python-notebook',
      workspace_bucket: 'lab-data',
      group_id: 'group-1',
    })
    unsaved.cells[0].source = 'print(99)'
    localStorage.setItem(
      'aruna.notebook.lab-data/notebooks/counts.ipynb',
      JSON.stringify({ text: serializeNotebook(unsaved), changed_at_ms: 5 }),
    )
    const notebook = store()
    await notebook.load()
    expect(notebook.restoredCopy.value).toBe(true)
    expect(notebook.cells.value[0].source).toBe('print(99)')
  })

  it('saves at most every five minutes', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    s3.putTextObject.mockResolvedValue({ versionId: 'v1' })
    const notebook = store()
    await notebook.load()
    notebook.setSource(notebook.cells.value[0].id, 'print(2)')
    await notebook.autosave()
    expect(s3.putTextObject).not.toHaveBeenCalled()

    notebook.lastSavedMs.value = Date.now() - 300_001
    await notebook.autosave()
    expect(s3.putTextObject).toHaveBeenCalledOnce()
  })

  it('adds, moves and removes cells', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    const notebook = store()
    await notebook.load()
    const first = notebook.cells.value[0]
    const second = notebook.addCell('markdown', undefined, '# Title')
    expect(notebook.cells.value.map((cell) => cell.id)).toEqual([first.id, second.id])

    notebook.moveCell(second.id, -1)
    expect(notebook.cells.value.map((cell) => cell.id)).toEqual([second.id, first.id])

    notebook.removeCell(second.id)
    expect(notebook.cells.value.map((cell) => cell.id)).toEqual([first.id])

    // The last cell removed leaves one empty code cell behind.
    notebook.removeCell(first.id)
    expect(notebook.cells.value).toHaveLength(1)
    expect(notebook.cells.value[0].cell_type).toBe('code')
  })

  it('records what a cell run reported', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    const notebook = store()
    await notebook.load()
    const cell = notebook.cells.value[0]
    notebook.appendOutput(cell.id, { output_type: 'stream', name: 'stdout', text: 'hi\n' })
    notebook.noteCellRun(cell.id, { execution_count: 3, started_at_ms: 10, job_id: '01JOB' })
    expect(cell.outputs).toHaveLength(1)
    expect(cell.execution_count).toBe(3)
    expect(cell.metadata.aruna).toMatchObject({ job_id: '01JOB', started_at_ms: 10 })

    notebook.clearOutputs(cell.id)
    expect(cell.outputs).toHaveLength(0)
    expect(cell.execution_count).toBeNull()
  })
})
