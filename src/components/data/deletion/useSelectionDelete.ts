// Deleting an explicit selection of objects and folders. Every entry runs on
// its own, so a mixed result is reported exactly: only confirmed successes
// count as done and a transport that answered nothing stays "unknown" rather
// than "failed". A folder is identified by its prefix and deleted through the
// same prefix walk the single-folder control uses.
import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import { isS3NetworkError, s3ErrorMessage, useS3 } from '@/composables/useS3'
import type { DeletePrefixResult } from '@/composables/s3/objects'
import type { ApiClientOptions } from '@/lib/api'
import {
  controlStoragePurge,
  createStoragePurgeOperation,
  getStorageDeletionPreflight,
  getStoragePurgeJob,
  isTerminalStoragePurgeJob,
  startStoragePurge,
  storageDeletionErrorMessage,
  type StorageDeletionPreflight,
  type StoragePurgeOperation,
} from '@/lib/storageDeletion'
import { BULK_PREFLIGHT_CONCURRENCY, type BulkDeleteIssue } from './useDeletionPreflight'

const BATCH_SIZE = 1_000

/** One purge job runs per selected entry, so a larger selection is refused. */
export const MAX_SELECTION_PURGE = 500

/** What one selection acts on: object keys and folder prefixes. */
export interface SelectionTargets {
  keys: string[]
  prefixes: string[]
}

/** The sentence a partly failed prefix walk reports, or null when it all went. */
export function prefixDeleteFailure(result: DeletePrefixResult): string | null {
  const [first] = result.errors
  if (!first) return null
  return `${result.deleted} object${result.deleted === 1 ? '' : 's'} deleted, ${result.errors.length} failed. First failure: ${first.key}: ${first.message}`
}

export interface SelectionOutcome {
  committed: string[]
  failed: BulkDeleteIssue[]
  unknown: BulkDeleteIssue[]
}

interface KeyResult {
  key: string
  status: 'committed' | 'failed' | 'unknown'
  message?: string
}

interface PurgeScope {
  key: string
  operation: StoragePurgeOperation
  preflight: StorageDeletionPreflight | null
  error: string | null
}

// A transport that never produced a status left the server's state unknown;
// anything with an HTTP status is a definite refusal.
function failureStatus(error: unknown): 'failed' | 'unknown' {
  if (isS3NetworkError(error)) return 'unknown'
  if (!error || typeof error !== 'object') return 'unknown'
  const response = error as {
    status?: number
    statusCode?: number
    $metadata?: { httpStatusCode?: number }
  }
  return typeof (response.$metadata?.httpStatusCode ?? response.statusCode ?? response.status) ===
    'number'
    ? 'failed'
    : 'unknown'
}

export function useSelectionDelete() {
  const s3 = useS3()
  const outcome = ref<SelectionOutcome | null>(null)
  const scopes = ref<PurgeScope[]>([])
  const scopesBusy = ref(false)
  // Jobs that were started and have not ended, by key, so one control reaches all of them.
  const activeJobs = ref<Record<string, string>>({})
  // Jobs whose pause the node accepted; Resume reaches exactly these.
  const pausedJobs = ref<Record<string, string>>({})
  const paused = computed(() => Object.keys(pausedJobs.value).length > 0)
  // Start requests not yet answered. Until all are, there is no job list to control.
  const startsPending = ref(0)
  const starting = computed(() => startsPending.value > 0)
  const pollError = ref<string | null>(null)
  const controlError = ref<string | null>(null)
  let runId = 0

  // Each purge invocation starts with no jobs, pauses or errors of an earlier one.
  function resetTracking() {
    activeJobs.value = {}
    pausedJobs.value = {}
    startsPending.value = 0
    pollError.value = null
    controlError.value = null
  }

  function reset() {
    ++runId
    outcome.value = null
    scopes.value = []
    scopesBusy.value = false
    resetTracking()
  }

  const inventory = computed(() => {
    const loaded = scopes.value.flatMap((scope) => (scope.preflight ? [scope.preflight] : []))
    const total = (pick: (preflight: StorageDeletionPreflight) => number) =>
      loaded.reduce((sum, preflight) => sum + pick(preflight), 0)
    return {
      current_heads: total((preflight) => preflight.counts.current_heads),
      noncurrent_versions: total((preflight) => preflight.counts.noncurrent_versions),
      delete_markers: total((preflight) => preflight.counts.delete_markers),
      open_multipart_uploads: total((preflight) => preflight.counts.open_multipart_uploads),
      complete:
        loaded.length === scopes.value.length &&
        loaded.every((preflight) => preflight.counts.complete),
    }
  })

  const scopeErrors = computed(() =>
    scopes.value.flatMap((scope) => (scope.error ? [{ key: scope.key, message: scope.error }] : [])),
  )
  const deniedKeys = computed(() =>
    scopes.value.flatMap((scope) =>
      scope.preflight && !scope.preflight.permissions.purge ? [scope.key] : [],
    ),
  )

  /** Every selected entry answered a preflight that allows the purge. */
  function purgeReady(ids: string[]): boolean {
    return (
      ids.length <= MAX_SELECTION_PURGE &&
      scopes.value.length === ids.length &&
      scopes.value.every((scope) => scope.preflight?.permissions.purge)
    )
  }

  /** Keys still unresolved: everything on a first run, the rest on a retry. */
  function pendingKeys(keys: string[]): string[] {
    const previous = outcome.value
    if (!previous) return keys
    const unresolved = new Set([
      ...previous.failed.map((issue) => issue.key),
      ...previous.unknown.map((issue) => issue.key),
    ])
    return keys.filter((key) => unresolved.has(key))
  }

  function record(keys: string[], results: KeyResult[]) {
    const retained = new Map<string, KeyResult>()
    const previous = outcome.value
    for (const key of previous?.committed ?? []) retained.set(key, { key, status: 'committed' })
    for (const issue of previous?.failed ?? []) retained.set(issue.key, { ...issue, status: 'failed' })
    for (const issue of previous?.unknown ?? []) {
      retained.set(issue.key, { ...issue, status: 'unknown' })
    }
    for (const result of results) retained.set(result.key, result)
    const ordered = keys.flatMap((key) => (retained.has(key) ? [retained.get(key)!] : []))
    const issues = (status: 'failed' | 'unknown') =>
      ordered.flatMap((result) =>
        result.status === status ? [{ key: result.key, message: result.message ?? '' }] : [],
      )
    outcome.value = {
      committed: ordered.flatMap((result) => (result.status === 'committed' ? [result.key] : [])),
      failed: issues('failed'),
      unknown: issues('unknown'),
    }
  }

  async function loadScopes(
    bucket: string,
    targets: SelectionTargets,
    client: ApiClientOptions | null,
  ) {
    const id = ++runId
    const next: PurgeScope[] = [
      ...targets.keys.map((key) => ({
        key,
        operation: createStoragePurgeOperation({ kind: 'file', bucket, key }, undefined, { deleteStorageFiles: true }),
        preflight: null,
        error: null,
      })),
      ...targets.prefixes.map((prefix) => ({
        key: prefix,
        operation: createStoragePurgeOperation({ kind: 'prefix', bucket, prefix }, undefined, { deleteStorageFiles: true }),
        preflight: null,
        error: null,
      })),
    ]
    scopes.value = next
    scopesBusy.value = true
    if (!client) {
      scopes.value = next.map((scope) => ({
        ...scope,
        error: 'The node API endpoint for this storage location is unavailable.',
      }))
      scopesBusy.value = false
      return
    }
    try {
      for (let offset = 0; offset < next.length; offset += BULK_PREFLIGHT_CONCURRENCY) {
        const batch = next.slice(offset, offset + BULK_PREFLIGHT_CONCURRENCY)
        const settled = await Promise.allSettled(
          batch.map((scope) => getStorageDeletionPreflight(scope.operation.scope, client)),
        )
        if (id !== runId) return
        settled.forEach((result, index) => {
          const scope = batch[index]
          if (result.status === 'fulfilled') scope.preflight = result.value
          else scope.error = storageDeletionErrorMessage(result.reason)
        })
        scopes.value = [...next]
      }
    } finally {
      if (id === runId) scopesBusy.value = false
    }
  }

  async function deleteMarkers(
    bucket: string,
    nodeId: string | null,
    keys: string[],
    all: string[] = keys,
  ) {
    for (let offset = 0; offset < keys.length; offset += BATCH_SIZE) {
      const batch = keys.slice(offset, offset + BATCH_SIZE)
      const permitted = batch.map((key) => s3.canWrite(bucket, key, nodeId))
      const settled = await Promise.allSettled(
        batch.map((key, index) =>
          permitted[index] ? s3.deleteObject(bucket, key, nodeId) : Promise.resolve(),
        ),
      )
      record(
        all,
        settled.map<KeyResult>((result, index) => {
          const key = batch[index]
          if (!permitted[index]) {
            return { key, status: 'failed', message: 'This session no longer allows deleting this key.' }
          }
          if (result.status === 'fulfilled') return { key, status: 'committed' }
          return {
            key,
            status: failureStatus(result.reason),
            message: s3ErrorMessage(result.reason),
          }
        }),
      )
    }
  }

  // A folder runs the same prefix walk the single-folder delete runs: delete
  // markers, never a purge, with the walk's own per-key failures reported.
  async function deletePrefixes(
    bucket: string,
    nodeId: string | null,
    prefixes: string[],
    all: string[] = prefixes,
  ) {
    for (const key of prefixes) {
      if (!s3.canDeletePrefix(bucket, key, nodeId)) {
        record(all, [
          { key, status: 'failed', message: 'This session no longer allows deleting this folder.' },
        ])
        continue
      }
      try {
        const failure = prefixDeleteFailure(await s3.deletePrefix(bucket, key, nodeId))
        record(all, [
          failure ? { key, status: 'failed', message: failure } : { key, status: 'committed' },
        ])
      } catch (error) {
        record(all, [{ key, status: failureStatus(error), message: s3ErrorMessage(error) }])
      }
    }
  }

  async function runScope(scope: PurgeScope, client: ApiClientOptions, id: number): Promise<KeyResult> {
    const result = await trackScope(scope, client, id)
    const { [scope.key]: _ended, ...restActive } = activeJobs.value
    activeJobs.value = restActive
    const { [scope.key]: _paused, ...restPaused } = pausedJobs.value
    pausedJobs.value = restPaused
    return result
  }

  async function trackScope(scope: PurgeScope, client: ApiClientOptions, id: number): Promise<KeyResult> {
    let jobId: string
    try {
      jobId = (await startStoragePurge(scope.operation, client)).job_id
    } catch (error) {
      startsPending.value--
      return { key: scope.key, status: failureStatus(error), message: storageDeletionErrorMessage(error) }
    }
    activeJobs.value = { ...activeJobs.value, [scope.key]: jobId }
    startsPending.value--
    for (;;) {
      if (id !== runId) {
        return { key: scope.key, status: 'unknown', message: 'The result of this permanent deletion is no longer being tracked.' }
      }
      try {
        const status = await getStoragePurgeJob(jobId, client)
        pollError.value = null
        if (status.kind !== 'storage_purge') {
          return { key: scope.key, status: 'failed', message: `System job ${jobId} is not a permanent deletion.` }
        }
        if (isTerminalStoragePurgeJob(status.state)) {
          if (status.state === 'succeeded') return { key: scope.key, status: 'committed' }
          return {
            key: scope.key,
            status: 'failed',
            message: status.error?.message ?? `The permanent deletion was ${status.state}.`,
          }
        }
      } catch (error) {
        // The job runs on the node whether or not this read worked: keep its controls and try again.
        pollError.value = storageDeletionErrorMessage(error)
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }

  /**
   * Pauses, resumes or aborts the jobs the node has accepted. It does nothing while starts are
   * pending. Every success is kept, so a partial pause still offers Resume; a refusal is kept
   * in `controlError`, apart from polling errors.
   */
  async function controlAll(action: 'pause' | 'resume' | 'abort', client: ApiClientOptions) {
    if (starting.value) return
    controlError.value = null
    const targets = Object.entries(action === 'resume' ? pausedJobs.value : activeJobs.value)
    const settled = await Promise.allSettled(
      targets.map(([, jobId]) => controlStoragePurge(jobId, action, client)),
    )
    const next = { ...pausedJobs.value }
    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return
      const [key, jobId] = targets[index]
      if (action === 'pause') next[key] = jobId
      else delete next[key]
    })
    pausedJobs.value = next
    const refused = settled.find((result) => result.status === 'rejected')
    if (refused?.status === 'rejected') controlError.value = storageDeletionErrorMessage(refused.reason)
  }

  async function purgeKeys(ids: string[], client: ApiClientOptions | null, all: string[]) {
    if (!client) {
      record(
        all,
        ids.map((key) => ({
          key,
          status: 'failed' as const,
          message: 'The node API endpoint for this storage location is unavailable.',
        })),
      )
      return
    }
    resetTracking()
    startsPending.value = ids.length
    const id = runId
    const byKey = new Map(scopes.value.map((scope) => [scope.key, scope]))
    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      const batch = ids.slice(offset, offset + BATCH_SIZE)
      // Each entry is recorded as it ends, so the combined progress moves.
      await Promise.all(
        batch.map(async (key) => {
          const scope = byKey.get(key)
          if (!scope) startsPending.value--
          const result = scope
            ? await runScope(scope, client, id)
            : ({
                key,
                status: 'failed',
                message: 'The permanent deletion preflight is unavailable for this key.',
              } as KeyResult)
          if (id === runId) record(all, [result])
        }),
      )
      if (id !== runId) return
    }
  }

  // A closed dialog stops the polling of jobs it still tracks.
  if (getCurrentScope()) onScopeDispose(() => ++runId)

  return {
    outcome,
    scopes,
    scopesBusy,
    inventory,
    scopeErrors,
    deniedKeys,
    purgeReady,
    pendingKeys,
    reset,
    loadScopes,
    deleteMarkers,
    deletePrefixes,
    purgeKeys,
    paused,
    pollError,
    controlError,
    starting,
    controlAll,
  }
}

export type SelectionDelete = ReturnType<typeof useSelectionDelete>
