// Per-view basket that accumulates heterogeneous import rows and submits them:
// connector and internal (aruna_native) rows through synchronous staging, local
// files through the persistent upload queue. A FACTORY, not a module singleton —
// each builder view owns its own basket, cleared when the view unmounts.
import { computed, ref, watch, type Ref } from 'vue'
import { useStaging, stagingErrorMessage } from './useStaging'
import { useUploadQueue } from './useUploadQueue'
import { isUnsupportedEndpoint, useAruna } from './useAruna'
import { portalConfig } from '@/lib/config'
import type { StagingBatchRequest, StagingStrategy } from '@/lib/api'

export type BasketSourceKind = 'internal' | 'connector' | 'upload'
export type BasketRowState = 'ready' | 'blocked' | 'submitting' | 'done' | 'error'

export interface BuilderRow {
  id: number
  sourceKind: BasketSourceKind
  // s3:// reference (internal), connector-relative path (connector), file name (upload).
  source: string
  targetKey: string
  strategy: StagingStrategy | null
  groupId: string | null
  connectorId: string | null
  connectorName: string | null
  size: number | null
  keyEdited: boolean
  state: BasketRowState
  progress: number
  error: string | null
  blockedReason: string | null
  // Links an upload row to its useUploadQueue item for live progress.
  uploadId: number | null
  // Connector rows only: the source is a whole folder (staged via the batch
  // endpoint's `prefixes`; per-item staging cannot express it).
  isPrefix?: boolean
}

export interface StagingSeed {
  source: string
  strategy: StagingStrategy
  groupId: string
  connectorId: string | null
  connectorName: string | null
  blockedReason?: string
  isPrefix?: boolean
}

// Builder ships on by default; a deployment can still disable it by serving
// `{ "features": { "builder": false } }` in portal-config.json.
export function builderEnabled(): boolean {
  return portalConfig().features.builder !== false
}

function basename(path: string): string {
  const stripped = path.replace(/^s3:\/\//, '').replace(/\/+$/, '')
  return stripped.split('/').filter(Boolean).pop() ?? stripped
}

// aruna_native staging reads the s3://bucket/key reference as a connector-relative
// bucket/key path; every other kind already carries a relative path.
function stagingSourcePath(row: BuilderRow): string {
  return row.sourceKind === 'internal' ? row.source.replace(/^s3:\/\//, '') : row.source
}

export function useBuilderBasket(ctx: {
  bucket: Ref<string>
  prefix: Ref<string>
  groupId: Ref<string | null>
  /** Keys already present in the caller's listing; uploads targeting one are marked as overwriting. */
  existingKeys?: Ref<ReadonlySet<string>>
}) {
  const staging = useStaging()
  const uploads = useUploadQueue()

  const rows = ref<BuilderRow[]>([])
  const files = new Map<number, File>()
  let counter = 0

  function targetFor(source: string): string {
    return `${ctx.prefix.value}${basename(source)}`
  }

  function dedupeKey(kind: BasketSourceKind, source: string, size: number | null): string {
    return kind === 'upload' ? `upload|${source}|${size ?? ''}` : `${kind}|${source}`
  }

  const seen = computed(
    () => new Set(rows.value.map((row) => dedupeKey(row.sourceKind, row.source, row.size))),
  )

  function addStaging(kind: 'internal' | 'connector', seeds: StagingSeed[]): number {
    let added = 0
    for (const seed of seeds) {
      if (seen.value.has(dedupeKey(kind, seed.source, null))) continue
      const blocked = Boolean(seed.blockedReason) || !seed.connectorId
      rows.value.push({
        id: ++counter,
        sourceKind: kind,
        source: seed.source,
        targetKey: seed.isPrefix ? `${ctx.prefix.value}${basename(seed.source)}/` : targetFor(seed.source),
        strategy: seed.strategy,
        groupId: seed.groupId,
        connectorId: seed.connectorId,
        connectorName: seed.connectorName,
        size: null,
        keyEdited: false,
        state: blocked ? 'blocked' : 'ready',
        progress: 0,
        error: null,
        blockedReason: seed.blockedReason ?? (seed.connectorId ? null : 'No connector selected.'),
        uploadId: null,
        ...(seed.isPrefix ? { isPrefix: true } : {}),
      })
      added++
    }
    return added
  }

  // A picked folder's files carry webkitRelativePath — keep the folder
  // structure in the source label and the target key.
  function uploadSource(file: File): string {
    const relative = file.webkitRelativePath
    return relative && relative.length ? relative : file.name
  }

  function addUploads(list: File[]): number {
    let added = 0
    for (const file of list) {
      const source = uploadSource(file)
      if (seen.value.has(dedupeKey('upload', source, file.size))) continue
      const row: BuilderRow = {
        id: ++counter,
        sourceKind: 'upload',
        source,
        targetKey: `${ctx.prefix.value}${source}`,
        strategy: null,
        groupId: ctx.groupId.value,
        connectorId: null,
        connectorName: null,
        size: file.size,
        keyEdited: false,
        state: 'ready',
        progress: 0,
        error: null,
        blockedReason: null,
        uploadId: null,
      }
      files.set(row.id, file)
      rows.value.push(row)
      added++
    }
    return added
  }

  function editKey(id: number, value: string) {
    const row = rows.value.find((entry) => entry.id === id)
    if (!row) return
    row.keyEdited = true
    row.targetKey = value
  }

  function removeRow(id: number) {
    files.delete(id)
    rows.value = rows.value.filter((entry) => entry.id !== id)
  }

  function clearDone() {
    for (const row of rows.value) if (row.state === 'done') files.delete(row.id)
    rows.value = rows.value.filter((entry) => entry.state !== 'done')
  }

  async function runStaging(row: BuilderRow) {
    if (!row.connectorId || !row.strategy || !row.groupId) return
    row.state = 'submitting'
    row.error = null
    try {
      await staging.submitStaging({
        strategy: row.strategy === 'sync' ? 'snapshot' : row.strategy,
        groupId: row.groupId,
        connectorId: row.connectorId,
        connectorName: row.connectorName ?? row.connectorId,
        sourcePath: stagingSourcePath(row),
        bucket: ctx.bucket.value,
        key: row.targetKey.trim(),
      })
      row.state = 'done'
      row.progress = 100
    } catch (err) {
      row.state = 'error'
      row.error = stagingErrorMessage(err)
    }
  }

  function startUpload(row: BuilderRow) {
    const file = files.get(row.id)
    if (!file) {
      row.state = 'error'
      row.error = 'File no longer available for upload.'
      return
    }
    row.state = 'submitting'
    row.error = null
    const targetKey = row.targetKey.trim()
    uploads.enqueue([file], {
      bucket: ctx.bucket.value,
      prefix: ctx.prefix.value,
      groupId: row.groupId,
      key: targetKey,
      overwrite: ctx.existingKeys?.value.has(targetKey) ?? false,
    })
    // enqueue appends synchronously, so the row's item is the last one.
    row.uploadId = uploads.items.value[uploads.items.value.length - 1]?.id ?? null
  }

  // ── Batch staging (agreed contract) ────────────────────────────────────────
  // Staging rows sharing group+connector+strategy submit as ONE POST
  // /staging/batch. A node without the endpoint (404/501) falls back to per-item
  // staging; folder (prefix) rows cannot be expressed per-item and error with a
  // short "not supported" hint instead.
  const { stageBatch } = useAruna()
  let batchUnsupported = false

  function batchGroups(pending: BuilderRow[]): BuilderRow[][] {
    const groups = new Map<string, BuilderRow[]>()
    for (const row of pending) {
      const key = `${row.groupId}|${row.connectorId}|${row.strategy === 'sync' ? 'snapshot' : row.strategy}`
      const list = groups.get(key) ?? []
      list.push(row)
      groups.set(key, list)
    }
    return [...groups.values()]
  }

  async function runBatch(batch: BuilderRow[]): Promise<void> {
    const first = batch[0]
    if (!first?.connectorId || !first.strategy || !first.groupId) return
    for (const row of batch) {
      row.state = 'submitting'
      row.error = null
    }
    const body: StagingBatchRequest = {
      group_id: first.groupId,
      connector_id: first.connectorId,
      bucket: ctx.bucket.value,
      strategy: first.strategy === 'sync' ? 'snapshot' : first.strategy,
      items: batch
        .filter((row) => !row.isPrefix)
        .map((row) => ({ source_path: stagingSourcePath(row), target_key: row.targetKey.trim() })),
      prefixes: batch
        .filter((row) => row.isPrefix)
        .map((row) => ({ source_prefix: stagingSourcePath(row), target_prefix: row.targetKey.trim() })),
    }
    if (!body.items?.length) delete body.items
    if (!body.prefixes?.length) delete body.prefixes
    try {
      const response = await stageBatch(body)
      // Map results back by source path; a missing result counts as success for
      // prefixes (their per-file results carry expanded paths) and as an error
      // for items.
      const bySource = new Map(response.results.map((result) => [result.source_path, result]))
      for (const row of batch) {
        const result = bySource.get(stagingSourcePath(row))
        if (row.isPrefix) {
          const failed = response.results.find(
            (entry) => entry.status === 'error' && entry.source_path.startsWith(stagingSourcePath(row)),
          )
          row.state = failed ? 'error' : 'done'
          row.error = failed ? failed.error ?? 'Some entries failed to stage.' : null
          row.progress = failed ? 0 : 100
        } else if (result && result.status === 'ok') {
          row.state = 'done'
          row.progress = 100
        } else {
          row.state = 'error'
          row.error = result?.error ?? 'The node returned no result for this entry.'
        }
      }
    } catch (err) {
      if (isUnsupportedEndpoint(err)) {
        batchUnsupported = true
        for (const row of batch) {
          if (row.isPrefix) {
            row.state = 'error'
            row.error = 'Folder staging is not supported by this node yet — add the files individually.'
          } else {
            row.state = 'ready'
          }
        }
        // Per-item fallback for the file rows.
        for (const row of batch) {
          if (!row.isPrefix) await runStaging(row)
        }
        return
      }
      for (const row of batch) {
        row.state = 'error'
        row.error = stagingErrorMessage(err)
      }
    }
  }

  async function submit() {
    const pending = rows.value.filter((row) => row.state === 'ready')
    for (const row of pending) {
      if (row.sourceKind === 'upload') startUpload(row)
    }
    const stagingRows = pending.filter((row) => row.sourceKind !== 'upload')
    if (!stagingRows.length) return
    if (batchUnsupported) {
      // Known-unsupported node: per-item staging, one at a time (slow sync op).
      for (const row of stagingRows) {
        if (row.isPrefix) {
          row.state = 'error'
          row.error = 'Folder staging is not supported by this node yet — add the files individually.'
        } else {
          await runStaging(row)
        }
      }
      return
    }
    for (const batch of batchGroups(stagingRows)) {
      await runBatch(batch)
    }
  }

  async function retryRow(id: number) {
    const row = rows.value.find((entry) => entry.id === id)
    if (!row || (row.state !== 'error' && row.state !== 'blocked')) return
    if (row.sourceKind === 'upload') startUpload(row)
    else if (row.isPrefix) await runBatch([row])
    else await runStaging(row)
  }

  // Auto-fill target keys from the (changing) prefix until the user edits a row.
  watch(ctx.prefix, () => {
    for (const row of rows.value) {
      if (!row.keyEdited && (row.state === 'ready' || row.state === 'blocked')) {
        row.targetKey =
          row.sourceKind === 'upload'
            ? `${ctx.prefix.value}${row.source}`
            : row.isPrefix
              ? `${ctx.prefix.value}${basename(row.source)}/`
              : targetFor(row.source)
      }
    }
  })

  // Mirror live upload queue state onto the linked rows.
  watch(
    uploads.items,
    (items) => {
      for (const row of rows.value) {
        if (row.uploadId == null) continue
        const item = items.find((entry) => entry.id === row.uploadId)
        if (!item) continue
        row.progress = item.progress
        if (item.state === 'done') row.state = 'done'
        else if (item.state === 'error') {
          row.state = 'error'
          row.error = item.error ?? 'Upload failed.'
        } else if (item.state === 'canceled') {
          row.state = 'error'
          row.error = 'Upload canceled.'
        } else row.state = 'submitting'
      }
    },
    { deep: true },
  )

  const summary = computed(() => {
    const by = (state: BasketRowState) => rows.value.filter((row) => row.state === state).length
    return {
      total: rows.value.length,
      ready: by('ready'),
      blocked: by('blocked'),
      submitting: by('submitting'),
      done: by('done'),
      error: by('error'),
    }
  })

  const canSubmit = computed(() => summary.value.ready > 0 && summary.value.submitting === 0)
  const busy = computed(() => summary.value.submitting > 0)

  return {
    rows,
    summary,
    canSubmit,
    busy,
    addStaging,
    addUploads,
    editKey,
    removeRow,
    clearDone,
    retryRow,
    submit,
  }
}
