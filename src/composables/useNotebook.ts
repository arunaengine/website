// The open notebook: the document in the workspace bucket, the unsaved copy in
// this browser, and the cell edits the view makes. The session lives next door
// in useNotebookSession.
import { computed, ref, type Ref } from 'vue'
import { useS3 } from '@/composables/useS3'
import {
  autosaveDue,
  clearWorkingCopy,
  notebookName,
  readWorkingCopy,
  writeWorkingCopy,
} from '@/lib/notebook/document'
import {
  emptyNotebook,
  newCell,
  parseNotebook,
  serializeNotebook,
  type CellKind,
  type Notebook,
  type NotebookAruna,
  type NotebookCell,
  type NotebookOutput,
} from '@/lib/notebook/nbformat'
import { errorMessage } from '@/lib/utils'

export const NOTEBOOK_CONTENT_TYPE = 'application/x-ipynb+json'

export interface NotebookSeed {
  runtime: string
  group_id: string
}

/** A read that found no object; a new notebook starts empty instead. */
function missingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const shape = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
  const code = shape.Code ?? shape.name
  return code === 'NoSuchKey' || code === 'NotFound' || shape.$metadata?.httpStatusCode === 404
}

export function createNotebook(bucket: Ref<string>, key: Ref<string>, seed: () => NotebookSeed) {
  const s3 = useS3()
  const notebook = ref<Notebook | null>(null)
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const saving = ref(false)
  const saveError = ref<string | null>(null)
  /** When the last edit happened; null once everything is saved. */
  const changedAt = ref<number | null>(null)
  const lastSavedMs = ref(0)
  /** True while the notebook shows unsaved edits taken from this browser. */
  const restoredCopy = ref(false)
  const isNew = ref(false)

  const name = computed(() => notebookName(key.value))
  const cells = computed<NotebookCell[]>(() => notebook.value?.cells ?? [])
  const meta = computed<NotebookAruna | null>(() => notebook.value?.metadata.aruna ?? null)
  const dirty = computed(() => changedAt.value !== null)

  function markChanged() {
    const doc = notebook.value
    if (!doc) return
    changedAt.value = Date.now()
    writeWorkingCopy(bucket.value, key.value, serializeNotebook(doc), changedAt.value)
  }

  async function load(): Promise<void> {
    loading.value = true
    loadError.value = null
    restoredCopy.value = false
    try {
      let text: string | null = null
      try {
        text = await s3.getObjectText(bucket.value, key.value)
        isNew.value = false
      } catch (error) {
        if (!missingObject(error)) throw error
        isNew.value = true
      }
      notebook.value = text === null ? emptyNotebook({ version: 1, workspace_bucket: bucket.value, ...seed() }) : parseNotebook(text)
      lastSavedMs.value = Date.now()
      changedAt.value = null
      const copy = readWorkingCopy(bucket.value, key.value)
      if (copy && copy.text !== (text ?? '')) {
        try {
          notebook.value = parseNotebook(copy.text)
          restoredCopy.value = true
          changedAt.value = copy.changed_at_ms || Date.now()
        } catch {
          clearWorkingCopy(bucket.value, key.value)
        }
      }
    } catch (error) {
      loadError.value = errorMessage(error)
    } finally {
      loading.value = false
    }
  }

  async function save(): Promise<boolean> {
    const doc = notebook.value
    if (!doc || saving.value) return false
    saving.value = true
    saveError.value = null
    try {
      await s3.putTextObject(bucket.value, key.value, serializeNotebook(doc), NOTEBOOK_CONTENT_TYPE)
      lastSavedMs.value = Date.now()
      changedAt.value = null
      isNew.value = false
      restoredCopy.value = false
      clearWorkingCopy(bucket.value, key.value)
      return true
    } catch (error) {
      saveError.value = errorMessage(error)
      return false
    } finally {
      saving.value = false
    }
  }

  /** Saves at most every five minutes, and only after a change. */
  async function autosave(): Promise<void> {
    if (!autosaveDue(changedAt.value, lastSavedMs.value, Date.now())) return
    await save()
  }

  function discardCopy(): void {
    clearWorkingCopy(bucket.value, key.value)
    restoredCopy.value = false
    void load()
  }

  function patchMeta(patch: Partial<NotebookAruna>): void {
    const doc = notebook.value
    if (!doc) return
    doc.metadata.aruna = { ...doc.metadata.aruna, ...patch }
    markChanged()
  }

  function cellById(id: string): NotebookCell | undefined {
    return notebook.value?.cells.find((cell) => cell.id === id)
  }

  function addCell(kind: CellKind, index?: number, source = ''): NotebookCell {
    const doc = notebook.value
    const cell = newCell(kind, source)
    if (doc) {
      const at = index === undefined ? doc.cells.length : Math.max(0, Math.min(index, doc.cells.length))
      doc.cells.splice(at, 0, cell)
      markChanged()
    }
    return cell
  }

  function removeCell(id: string): void {
    const doc = notebook.value
    if (!doc) return
    doc.cells = doc.cells.filter((cell) => cell.id !== id)
    if (!doc.cells.length) doc.cells.push(newCell('code'))
    markChanged()
  }

  function moveCell(id: string, offset: number): void {
    const doc = notebook.value
    if (!doc) return
    const index = doc.cells.findIndex((cell) => cell.id === id)
    const next = index + offset
    if (index < 0 || next < 0 || next >= doc.cells.length) return
    const [cell] = doc.cells.splice(index, 1)
    doc.cells.splice(next, 0, cell)
    markChanged()
  }

  function setSource(id: string, source: string): void {
    const cell = cellById(id)
    if (!cell || cell.source === source) return
    cell.source = source
    markChanged()
  }

  function clearOutputs(id: string): void {
    const cell = cellById(id)
    if (!cell) return
    cell.outputs = []
    cell.execution_count = null
    markChanged()
  }

  function appendOutput(id: string, output: NotebookOutput): void {
    const cell = cellById(id)
    if (!cell) return
    cell.outputs = [...cell.outputs, output]
    markChanged()
  }

  /** Records what the session reported about one run of a cell. */
  function noteCellRun(
    id: string,
    run: { execution_count?: number; started_at_ms?: number; finished_at_ms?: number; job_id?: string },
  ): void {
    const cell = cellById(id)
    if (!cell) return
    if (run.execution_count !== undefined) cell.execution_count = run.execution_count
    cell.metadata.aruna = { ...cell.metadata.aruna, ...run }
    markChanged()
  }

  return {
    bucket,
    key,
    name,
    notebook,
    cells,
    meta,
    loading,
    loadError,
    saving,
    saveError,
    dirty,
    changedAt,
    lastSavedMs,
    restoredCopy,
    isNew,
    load,
    save,
    autosave,
    discardCopy,
    markChanged,
    patchMeta,
    cellById,
    addCell,
    removeCell,
    moveCell,
    setSource,
    clearOutputs,
    appendOutput,
    noteCellRun,
  }
}

export type NotebookStore = ReturnType<typeof createNotebook>
