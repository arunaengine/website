// The open notebook: the document in the workspace bucket, the unsaved copy in
// this browser, and the cell edits the view makes. The session lives next door
// in useNotebookSession.
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { isS3AuthError, useS3 } from '@/composables/useS3'
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
  type CellAruna,
  type CellInputRef,
  type CellKind,
  type Notebook,
  type NotebookAruna,
  type NotebookCell,
  type NotebookOutput,
} from '@/lib/notebook/nbformat'
import { trailing } from '@/lib/throttle'
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
  const { apiBaseUrl, currentUser, nodeInfo } = useAruna()
  const scope = computed(() => JSON.stringify([
    apiBaseUrl.value, currentUser.value?.id, nodeInfo.value?.node.realm_id, nodeInfo.value?.node.peer_id,
  ]))
  const generation = ref(0)
  const notebook = ref<Notebook | null>(null)
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  /** The read was refused, so another group may still open this notebook. */
  const loadDenied = ref(false)
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

  // A running cell changes the document on every output line, so the copy is
  // written on a trailing timer. Every edit carries where its document came
  // from: the page may show another notebook by the time the timer fires.
  let loadedFrom: { scope: string; bucket: string; key: string; nodeId: string | null; groupId: string } | null = null
  let pending: { scope: string; bucket: string; key: string; doc: Notebook; changedAt: number } | null = null
  const copy = trailing(() => {
    if (!pending) return
    writeWorkingCopy(pending.scope, pending.bucket, pending.key, serializeNotebook(pending.doc), pending.changedAt)
    pending = null
  }, 1_000)
  function dropPending() {
    copy.cancel()
    pending = null
  }
  function invalidate() {
    copy.flush()
    generation.value += 1
    loadedFrom = null
    notebook.value = null
    changedAt.value = null
    saving.value = false
    loading.value = false
    saveError.value = null
  }
  watch([scope, bucket, key], invalidate, { flush: 'sync' })
  onScopeDispose(invalidate)

  // Counted, not timed: two edits in the same millisecond must still differ.
  let changeCount = 0

  function markChanged() {
    const doc = notebook.value
    if (!doc || !loadedFrom) return
    changeCount += 1
    changedAt.value = Date.now()
    pending = { ...loadedFrom, doc, changedAt: changedAt.value }
    copy.schedule()
  }

  async function load(): Promise<void> {
    invalidate()
    const request = generation.value
    const defaults = { version: 1 as const, workspace_bucket: bucket.value, ...seed() }
    const target = {
      scope: scope.value, bucket: bucket.value, key: key.value,
      nodeId: nodeInfo.value?.node.peer_id ?? null, groupId: defaults.group_id,
    }
    loading.value = true
    loadError.value = null
    loadDenied.value = false
    restoredCopy.value = false
    try {
      await s3.activateContext(target.nodeId, target.groupId)
      if (request !== generation.value) return
      const reference = s3.referenceForContext(target.nodeId, target.groupId)
      if (!reference) throw new Error('The notebook storage session is unavailable.')
      let text: string | null = null
      let missing = false
      try {
        text = await s3.getObjectText(target.bucket, target.key, target.nodeId, undefined, reference)
      } catch (error) {
        if (!missingObject(error)) throw error
        missing = true
      }
      if (request !== generation.value) return
      isNew.value = missing
      notebook.value = text === null ? emptyNotebook(defaults) : parseNotebook(text, defaults)
      // Everything this document does later happens where it was read from.
      loadedFrom = target
      lastSavedMs.value = Date.now()
      changedAt.value = null
      const unsaved = readWorkingCopy(target.scope, target.bucket, target.key)
      if (unsaved && unsaved.text !== (text ?? '')) {
        try {
          notebook.value = parseNotebook(unsaved.text)
          restoredCopy.value = true
          changedAt.value = unsaved.changed_at_ms || Date.now()
        } catch {
          clearWorkingCopy(target.scope, target.bucket, target.key)
        }
      }
    } catch (error) {
      if (request !== generation.value) return
      loadError.value = errorMessage(error)
      loadDenied.value = isS3AuthError(error) || !target.groupId
    } finally {
      if (request === generation.value) loading.value = false
    }
  }

  async function save(): Promise<boolean> {
    const doc = notebook.value
    if (!doc || saving.value || !loadedFrom) return false
    const target = loadedFrom
    const request = generation.value
    saving.value = true
    saveError.value = null
    // What was written is the document as it stood when the save started.
    const sent = serializeNotebook(doc)
    const changedBefore = changeCount
    try {
      let reference = s3.referenceForContext(target.nodeId, target.groupId)
      if (!reference) {
        await s3.activateContext(target.nodeId, target.groupId)
        if (request !== generation.value) return false
        reference = s3.referenceForContext(target.nodeId, target.groupId)
      }
      if (!reference) throw new Error('The notebook storage session is unavailable.')
      await s3.putTextObject(target.bucket, target.key, sent, NOTEBOOK_CONTENT_TYPE, target.nodeId, reference)
      if (request !== generation.value) return false
      lastSavedMs.value = Date.now()
      isNew.value = false
      restoredCopy.value = false
      // An edit made during the save keeps the notebook unsaved.
      if (changeCount === changedBefore) {
        changedAt.value = null
        dropPending()
        clearWorkingCopy(target.scope, target.bucket, target.key)
      }
      return true
    } catch (error) {
      if (request !== generation.value) return false
      saveError.value = errorMessage(error)
      return false
    } finally {
      if (request === generation.value) saving.value = false
    }
  }

  /** Saves at most every five minutes, and only after a change. */
  async function autosave(): Promise<void> {
    if (!autosaveDue(changedAt.value, lastSavedMs.value, Date.now())) return
    await save()
  }

  function discardCopy(): void {
    if (!loadedFrom) return
    dropPending()
    clearWorkingCopy(loadedFrom.scope, loadedFrom.bucket, loadedFrom.key)
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

  function addCell(kind: CellKind, index?: number, source = '', aruna?: CellAruna): NotebookCell {
    const doc = notebook.value
    const cell = newCell(kind, source)
    if (aruna) cell.metadata.aruna = aruna
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
    if (activeCellId.value === id) activeCellId.value = ''
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

  /** The cell the page acts on: staged files are recorded on it. */
  const activeCellId = ref('')

  function selectCell(id: string): void {
    activeCellId.value = id
  }

  /** Records the files that were staged for one cell. */
  function noteCellInputs(id: string, inputs: CellInputRef[]): void {
    const cell = cellById(id)
    if (!cell || !inputs.length) return
    const known = cell.metadata.aruna?.inputs ?? []
    cell.metadata.aruna = { ...cell.metadata.aruna, inputs: [...known, ...inputs] }
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
    scope,
    generation,
    bucket,
    key,
    name,
    notebook,
    cells,
    meta,
    loading,
    loadError,
    loadDenied,
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
    /** Writes a pending working copy now, before leaving the page. */
    flushCopy: () => copy.flush(),
    discardCopy,
    markChanged,
    patchMeta,
    cellById,
    activeCellId,
    selectCell,
    noteCellInputs,
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
