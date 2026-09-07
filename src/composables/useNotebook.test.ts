import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const s3 = vi.hoisted(() => ({
  getObjectText: vi.fn(), putTextObject: vi.fn(), activateContext: vi.fn(),
  referenceForContext: (nodeId: string, groupId: string) => ({ nodeId, groupId, accessKeyId: 'temporary' }),
}))
vi.mock('@/composables/useS3', () => ({ useS3: () => s3, isS3AuthError: () => false }))
const metadata = vi.hoisted(() => ({ create: vi.fn() }))
const apiBaseUrl = ref('/api/v1')
const currentUser = ref({ id: 'user-a' })
const nodeInfo = ref({ node: { realm_id: 'realm-a', peer_id: 'node-a' } })
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ apiBaseUrl, currentUser, nodeInfo, createMetadata: metadata.create }) }))
import { memoryStorage } from '@/test/storage'

const { createNotebook } = await import('./useNotebook')
const { emptyNotebook, serializeNotebook } = await import('@/lib/notebook/nbformat')
const { readWorkingCopy, workingCopyKey } = await import('@/lib/notebook/document')
const copyScope = () => JSON.stringify([apiBaseUrl.value, currentUser.value.id, nodeInfo.value.node.realm_id, nodeInfo.value.node.peer_id])


const seed = () => ({ runtime: 'python-notebook', group_id: 'group-1' })

function store(bucket = ref('lab-data'), key = ref('notebooks/counts.ipynb')) {
  return createNotebook(bucket, key, seed)
}

beforeEach(() => {
  apiBaseUrl.value = '/api/v1'
  currentUser.value = { id: 'user-a' }
  nodeInfo.value = { node: { realm_id: 'realm-a', peer_id: 'node-a' } }
  vi.stubGlobal('localStorage', memoryStorage())
  s3.getObjectText.mockReset()
  s3.putTextObject.mockReset()
  metadata.create.mockReset().mockResolvedValue({ document_id: 'snapshot-dataset' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createNotebook', () => {
  it('does not restore another account or node working copy', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    const notebook = store()
    await notebook.load()
    notebook.setSource(notebook.cells.value[0].id, 'private code')
    notebook.flushCopy()
    currentUser.value = { id: 'user-b' }
    expect(notebook.notebook.value).toBeNull()
    await notebook.load()
    expect(notebook.cells.value[0].source).toBe('')
    currentUser.value = { id: 'user-a' }
    apiBaseUrl.value = 'https://another.example/api/v1'
    await notebook.load()
    expect(notebook.cells.value[0].source).toBe('')
    apiBaseUrl.value = '/api/v1'
    nodeInfo.value = { node: { realm_id: 'realm-a', peer_id: 'node-b' } }
    await notebook.load()
    expect(notebook.cells.value[0].source).toBe('')
    nodeInfo.value = { node: { realm_id: 'realm-a', peer_id: 'node-a' } }
    await notebook.load()
    expect(notebook.cells.value[0].source).toBe('private code')
  })

  it('ignores a read that completes after another notebook opened', async () => {
    const first = emptyNotebook({ version: 1, runtime: 'python-notebook', workspace_bucket: 'lab-data', group_id: 'group-1' })
    first.cells[0].source = 'old document'
    let finish = (_value: string) => {}
    const delayed = new Promise<string>((resolve) => { finish = resolve })
    s3.getObjectText.mockReturnValueOnce(delayed).mockRejectedValue({ name: 'NoSuchKey' })
    const key = ref('notebooks/a.ipynb')
    const notebook = store(ref('lab-data'), key)
    const loading = notebook.load()
    await Promise.resolve()
    key.value = 'notebooks/b.ipynb'
    await notebook.load()
    finish(serializeNotebook(first))
    await loading
    expect(notebook.cells.value[0].source).toBe('')
    notebook.setSource(notebook.cells.value[0].id, 'new document')
    await notebook.save()
    expect(s3.putTextObject.mock.calls[0]).toEqual([
      'lab-data', 'notebooks/b.ipynb', expect.stringContaining('new document'),
      'application/x-ipynb+json', 'node-a', { nodeId: 'node-a', groupId: 'group-1', accessKeyId: 'temporary' },
    ])
  })

  it('does not clear a new document edit when the old save finishes', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    let finish = () => {}
    s3.putTextObject.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    const key = ref('notebooks/a.ipynb')
    const notebook = store(ref('lab-data'), key)
    await notebook.load()
    notebook.setSource(notebook.cells.value[0].id, 'old edit')
    const saving = notebook.save()
    key.value = 'notebooks/b.ipynb'
    await notebook.load()
    notebook.setSource(notebook.cells.value[0].id, 'new edit')
    finish()
    expect(await saving).toBe(false)
    expect(notebook.dirty.value).toBe(true)
    expect(notebook.cells.value[0].source).toBe('new edit')
  })

  it('clears the previous document on a failed read', async () => {
    s3.getObjectText.mockRejectedValueOnce({ name: 'NoSuchKey' }).mockRejectedValue(new Error('unavailable'))
    const notebook = store()
    await notebook.load()
    await notebook.load()
    expect(notebook.loadError.value).toBe('unavailable')
    expect(notebook.notebook.value).toBeNull()
    expect(await notebook.save()).toBe(false)
  })

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
    // The copy is written on a trailing timer, not on every keystroke.
    expect(readWorkingCopy(copyScope(), 'lab-data', 'notebooks/counts.ipynb')).toBeNull()
    notebook.flushCopy()
    expect(readWorkingCopy(copyScope(), 'lab-data', 'notebooks/counts.ipynb')?.text).toContain('print(2)')

    await notebook.save()
    expect(s3.putTextObject).toHaveBeenCalledOnce()
    expect(notebook.dirty.value).toBe(false)
    expect(readWorkingCopy(copyScope(), 'lab-data', 'notebooks/counts.ipynb')).toBeNull()
  })

  it('keeps a notebook edited during a save unsaved', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    let release = () => {}
    s3.putTextObject.mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({ versionId: 'v1' })
      }),
    )
    const notebook = store()
    await notebook.load()
    const cell = notebook.cells.value[0]
    notebook.setSource(cell.id, 'print(2)')
    const saved = notebook.save()
    notebook.setSource(cell.id, 'print(3)')
    release()
    await saved

    expect(notebook.dirty.value).toBe(true)
    notebook.flushCopy()
    expect(readWorkingCopy(copyScope(), 'lab-data', 'notebooks/counts.ipynb')?.text).toContain('print(3)')
  })

  it('writes an unsaved edit under the notebook it belongs to', async () => {
    // The page may already show another notebook when the timer fires.
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    const key = ref('notebooks/a.ipynb')
    const notebook = store(ref('lab-data'), key)
    await notebook.load()
    notebook.setSource(notebook.cells.value[0].id, 'print(1)')

    key.value = 'notebooks/b.ipynb'
    await notebook.load()

    expect(readWorkingCopy(copyScope(), 'lab-data', 'notebooks/a.ipynb')?.text).toContain('print(1)')
    expect(readWorkingCopy(copyScope(), 'lab-data', 'notebooks/b.ipynb')).toBeNull()
    expect(notebook.cells.value[0].source).toBe('')
  })

  it('invalidates the previous document when the route changes', async () => {
    // Opening another notebook changes the route before the read happens.
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    s3.putTextObject.mockResolvedValue({ versionId: 'v1' })
    const key = ref('notebooks/a.ipynb')
    const notebook = store(ref('lab-data'), key)
    await notebook.load()

    notebook.setSource(notebook.cells.value[0].id, 'print(1)')
    key.value = 'notebooks/b.ipynb'
    notebook.flushCopy()
    await notebook.save()

    expect(readWorkingCopy(copyScope(), 'lab-data', 'notebooks/b.ipynb')).toBeNull()
    expect(s3.putTextObject).not.toHaveBeenCalled()
    expect(notebook.notebook.value).toBeNull()
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
      workingCopyKey(copyScope(), 'lab-data', 'notebooks/counts.ipynb'),
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

  it('converts cell types while preserving text and unrelated metadata', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    const notebook = store()
    await notebook.load()
    const cell = notebook.cells.value[0]
    notebook.setSource(cell.id, 'echo hello')
    cell.metadata = { custom: true, aruna: { job_id: 'retained-job' } }
    notebook.appendOutput(cell.id, { output_type: 'stream', name: 'stdout', text: 'old' })
    notebook.setCellType(cell.id, 'bash')
    expect(cell.source).toBe('%%bash\necho hello')
    expect(cell.outputs).toEqual([])
    notebook.setCellType(cell.id, 'markdown')
    expect(cell.cell_type).toBe('markdown')
    expect(cell.source).toBe('echo hello')
    expect(cell.metadata).toEqual({ custom: true, aruna: { job_id: 'retained-job' } })
    notebook.setCellType(cell.id, 'pipeline')
    expect(cell.cell_type).toBe('markdown')
    notebook.setSource(cell.id, '')
    notebook.setCellType(cell.id, 'pipeline')
    expect(cell.metadata.aruna).toEqual({ job_id: 'retained-job', kind: 'pipeline' })
    notebook.setCellType(cell.id, 'code')
    expect(cell.metadata.aruna).toEqual({ job_id: 'retained-job' })
    expect(notebook.dirty.value).toBe(true)
  })

  it('embeds PNG attachments without replacing existing images', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    const notebook = store()
    await notebook.load()
    const cell = notebook.addCell('markdown', undefined, '# Images')
    notebook.addAttachment(cell.id, 'plot.png', 'first')
    notebook.addAttachment(cell.id, 'plot.png', 'second')
    expect(cell.attachments?.['plot.png']).toEqual({ 'image/png': 'first' })
    expect(Object.values(cell.attachments!)).toContainEqual({ 'image/png': 'second' })
    expect(cell.source).toContain('attachment:plot.png')
    expect(notebook.dirty.value).toBe(true)
  })

  it.each([false, true])('captures fixed notebook bytes and refuses a changed document: changed=%s', async (changed) => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    const notebook = store()
    await notebook.load()
    const cell = notebook.cells.value[0]
    notebook.setSource(cell.id, 'print(42)')
    notebook.appendOutput(cell.id, { output_type: 'stream', name: 'stdout', text: '42' })
    let upload = () => {}
    let release = () => {}
    const entered = new Promise<void>((resolve) => { upload = resolve })
    s3.putTextObject.mockImplementation(async () => { upload(); await new Promise<void>((resolve) => { release = resolve }); return { versionId: 'frozen-version' } })
    const result = notebook.capture()
    const outcome = result.then((id) => id, (error: Error) => error.message)
    await entered
    if (changed) currentUser.value = { id: 'other-user' }
    else notebook.setSource(cell.id, 'newer draft')
    release()
    if (changed) {
      expect(await outcome).toContain('changed during capture')
      expect(metadata.create).not.toHaveBeenCalled()
    } else {
      expect(await outcome).toBe('snapshot-dataset')
      expect(s3.putTextObject.mock.calls[0][2]).toContain('print(42)')
      expect(s3.putTextObject.mock.calls[0][2]).not.toContain('newer draft')
      expect(cell.source).toBe('newer draft')
      const input = metadata.create.mock.calls[0][0]
      expect(input).toMatchObject({ group_id: 'group-1', public: false })
      const file = input.rocrate['@graph'].find((entity: Record<string, unknown>) => entity['@type'] === 'File')
      expect(file.contentUrl).toContain('?versionId=frozen-version')
      expect(file['@id']).toMatch(/^https:\/\/w3id.org\/aruna\/data\/[0-9a-f]{64}$/)
    }
  })

  it('does not create a run-crate without a pinned snapshot version', async () => {
    s3.getObjectText.mockRejectedValue({ name: 'NoSuchKey' })
    s3.putTextObject.mockResolvedValue({ versionId: null })
    const notebook = store()
    await notebook.load()
    await expect(notebook.capture()).rejects.toThrow('without a version')
    expect(metadata.create).not.toHaveBeenCalled()
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
