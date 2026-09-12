// The open notebook: the document in the workspace bucket, the unsaved copy in
// this browser, and the cell edits the view makes. The session lives next door
// in useNotebookSession.
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { isS3AuthError, useS3 } from '@/composables/useS3'
import type { S3SessionReference } from '@/composables/s3/session'
import {
  AUTOSAVE_DELAY_MS,
  autosaveDue,
  clearWorkingCopy,
  notebookName,
  readWorkingCopy,
  writeWorkingCopy,
} from '@/lib/notebook/document'
import {
  cellType,
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
  type NotebookCellType,
  type NotebookOutput,
} from '@/lib/notebook/nbformat'
import { blake3 } from 'hash-wasm'
import { contentIdentityFromBlake3 } from '@/lib/contentIdentity'
import { snapshotCrate } from '@/lib/notebook/capture'
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
  const { apiBaseUrl, currentUser, nodeInfo, createMetadata } = useAruna()
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
  // Every change is saved two seconds after the last one; every PUT is a
  // kept version, so nothing waits for a manual save.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function cancelSave() {
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = null
  }
  function scheduleSave() {
    cancelSave()
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (changedAt.value !== null) void save()
    }, AUTOSAVE_DELAY_MS)
  }
  function invalidate() {
    copy.flush()
    cancelSave()
    // Edits from the last two seconds go out with the page or the route.
    if (changedAt.value !== null) void save()
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
    scheduleSave()
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
      // The crash buffer of this browser wins when it is newer than what is
      // stored; it is saved right away. Otherwise the stored document wins.
      const unsaved = readWorkingCopy(target.scope, target.bucket, target.key)
      let keepCopy = false
      if (unsaved && unsaved.text !== (text ?? '')) {
        const storedMs = missing ? 0 : await storedModifiedMs(target, reference)
        if (request !== generation.value) return
        keepCopy = unsaved.changed_at_ms > storedMs
      }
      isNew.value = missing
      notebook.value = text === null ? emptyNotebook(defaults) : parseNotebook(text, defaults)
      // Everything this document does later happens where it was read from.
      loadedFrom = target
      lastSavedMs.value = Date.now()
      changedAt.value = null
      if (!keepCopy || !unsaved) {
        if (unsaved) clearWorkingCopy(target.scope, target.bucket, target.key)
        return
      }
      try {
        notebook.value = parseNotebook(unsaved.text)
        changedAt.value = unsaved.changed_at_ms || Date.now()
        void save()
      } catch {
        clearWorkingCopy(target.scope, target.bucket, target.key)
      }
    } catch (error) {
      if (request !== generation.value) return
      loadError.value = errorMessage(error)
      loadDenied.value = isS3AuthError(error) || !target.groupId
    } finally {
      if (request === generation.value) loading.value = false
    }
  }

  /** When the stored object last changed; 0 when that cannot be read. */
  async function storedModifiedMs(
    target: { bucket: string; key: string; nodeId: string | null },
    reference: S3SessionReference,
  ): Promise<number> {
    try {
      const head = await s3.headObject(target.bucket, target.key, target.nodeId, undefined, reference)
      return head.lastModified?.getTime() ?? 0
    } catch {
      return 0
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
      // An edit made during the save keeps the notebook unsaved.
      if (changeCount === changedBefore) {
        changedAt.value = null
        dropPending()
        clearWorkingCopy(target.scope, target.bucket, target.key)
      } else {
        scheduleSave()
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

  /** Saves a notebook that changed and has been quiet since; a retry path. */
  async function autosave(): Promise<void> {
    if (!autosaveDue(changedAt.value, Date.now())) return
    await save()
  }

  /** Saves waiting edits now, before a kernel start, a capture or page leave. */
  async function flushSave(): Promise<boolean> {
    cancelSave()
    return changedAt.value === null ? true : save()
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

  function setCellType(id: string, type: NotebookCellType): void {
    const cell = cellById(id)
    if (!cell || cellType(cell) === type) return
    if (type === 'pipeline' && cell.source.trim() && cellType(cell) !== 'pipeline') return
    const source = cellType(cell) === 'bash' ? cell.source.replace(/^%%bash\r?\n?/, '') : cell.source
    cell.cell_type = type === 'pipeline' ? 'raw' : type === 'bash' ? 'code' : type
    cell.source = type === 'bash' ? `%%bash\n${source}` : source
    cell.outputs = []
    cell.execution_count = null
    if (type === 'pipeline') cell.metadata.aruna = { ...cell.metadata.aruna, kind: 'pipeline' }
    else if (cell.metadata.aruna?.kind === 'pipeline') delete cell.metadata.aruna.kind
    markChanged()
  }

  function addAttachment(id: string, name: string, data: string): void {
    const cell = cellById(id)
    if (!cell || cell.cell_type !== 'markdown') return
    let attachment = name
    while (cell.attachments?.[attachment]) attachment = `${crypto.randomUUID()}-${name}`
    cell.attachments = { ...cell.attachments, [attachment]: { 'image/png': data } }
    cell.source += `${cell.source ? '\n\n' : ''}![${name.replace(/[\[\]\\]/g, '\\$&')}](attachment:${encodeURIComponent(attachment)})`
    markChanged()
  }

  async function capture(): Promise<string> {
    if (!notebook.value || !loadedFrom || !currentUser.value) throw new Error('Load a notebook before capturing it.')
    const target = loadedFrom
    const request = generation.value
    const current = () => request === generation.value && loadedFrom === target
    const text = serializeNotebook(notebook.value)
    const title = name.value
    const author = currentUser.value.id
    const id = crypto.randomUUID()
    const snapshotKey = `notebooks/captures/${id}.ipynb`
    const started = new Date().toISOString()
    const hash = await blake3(text)
    if (!current()) throw new Error('The notebook changed before capture.')
    let reference = s3.referenceForContext(target.nodeId, target.groupId)
    if (!reference) {
      await s3.activateContext(target.nodeId, target.groupId)
      if (!current()) throw new Error('The notebook changed before capture.')
      reference = s3.referenceForContext(target.nodeId, target.groupId)
    }
    if (!reference) throw new Error('The notebook storage session is unavailable.')
    const saved = await s3.putTextObject(target.bucket, snapshotKey, text, NOTEBOOK_CONTENT_TYPE, target.nodeId, reference)
    if (!current()) throw new Error('The notebook changed during capture.')
    if (!saved.versionId) throw new Error('The snapshot was stored without a version; its run-crate was not created.')
    const identity = contentIdentityFromBlake3(hash)
    if (identity.status !== 'resolved') throw new Error('The snapshot content identity is unavailable.')
    const result = await createMetadata({
      group_id: target.groupId, path: `captures/notebooks/${id}`, public: false,
      rocrate: snapshotCrate({ id, name: title, author, started, finished: new Date().toISOString(), contentId: identity.id, contentUrl: `s3://${target.bucket}/${snapshotKey}?versionId=${encodeURIComponent(saved.versionId)}`, bytes: new TextEncoder().encode(text).byteLength }),
    })
    if (!current()) throw new Error('The notebook changed after capture.')
    return result.document_id
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
    isNew,
    load,
    save,
    autosave,
    flushSave,
    /** Writes a pending working copy now, before leaving the page. */
    flushCopy: () => copy.flush(),
    markChanged,
    patchMeta,
    cellById,
    activeCellId,
    selectCell,
    noteCellInputs,
    addCell,
    removeCell,
    setCellType,
    addAttachment,
    capture,
    moveCell,
    setSource,
    clearOutputs,
    appendOutput,
    noteCellRun,
  }
}

export type NotebookStore = ReturnType<typeof createNotebook>
