// Deleting an explicit selection of keys. Both semantics run key by key, so a
// mixed result is reported exactly: only confirmed successes count as done and
// a transport that answered nothing stays "unknown" rather than "failed".
import { computed, ref } from 'vue'
import { isS3NetworkError, s3ErrorMessage, useS3 } from '@/composables/useS3'
import type { ApiClientOptions } from '@/lib/api'
import {
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
  let runId = 0

  function reset() {
    ++runId
    outcome.value = null
    scopes.value = []
    scopesBusy.value = false
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

  /** Every selected key answered a preflight that allows the purge. */
  function purgeReady(keys: string[]): boolean {
    return (
      scopes.value.length === keys.length &&
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

  async function loadScopes(bucket: string, keys: string[], client: ApiClientOptions | null) {
    const id = ++runId
    const next: PurgeScope[] = keys.map((key) => ({
      key,
      operation: createStoragePurgeOperation({ kind: 'file', bucket, key }),
      preflight: null,
      error: null,
    }))
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

  async function deleteMarkers(bucket: string, nodeId: string | null, keys: string[]) {
    const all = keys
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

  async function runScope(scope: PurgeScope, client: ApiClientOptions, id: number): Promise<KeyResult> {
    try {
      const started = await startStoragePurge(scope.operation, client)
      for (;;) {
        if (id !== runId) {
          return { key: scope.key, status: 'unknown', message: 'The result of this permanent deletion is no longer being tracked.' }
        }
        const status = await getStoragePurgeJob(started.job_id, client)
        if (status.kind !== 'storage_purge') {
          return {
            key: scope.key,
            status: 'failed',
            message: `System job ${started.job_id} is not a permanent deletion.`,
          }
        }
        if (isTerminalStoragePurgeJob(status.state)) {
          if (status.state === 'succeeded') return { key: scope.key, status: 'committed' }
          return {
            key: scope.key,
            status: 'failed',
            message: status.error?.message ?? `The permanent deletion was ${status.state}.`,
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000))
      }
    } catch (error) {
      return {
        key: scope.key,
        status: failureStatus(error),
        message: storageDeletionErrorMessage(error),
      }
    }
  }

  async function purgeKeys(keys: string[], client: ApiClientOptions | null, all: string[]) {
    if (!client) {
      record(
        all,
        keys.map((key) => ({
          key,
          status: 'failed' as const,
          message: 'The node API endpoint for this storage location is unavailable.',
        })),
      )
      return
    }
    const id = runId
    const byKey = new Map(scopes.value.map((scope) => [scope.key, scope]))
    for (let offset = 0; offset < keys.length; offset += BATCH_SIZE) {
      const batch = keys.slice(offset, offset + BATCH_SIZE)
      const results = await Promise.all(
        batch.map((key) => {
          const scope = byKey.get(key)
          return scope
            ? runScope(scope, client, id)
            : Promise.resolve<KeyResult>({
                key,
                status: 'failed',
                message: 'The permanent deletion preflight is unavailable for this key.',
              })
        }),
      )
      if (id !== runId) return
      record(all, results)
    }
  }

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
    purgeKeys,
  }
}

export type SelectionDelete = ReturnType<typeof useSelectionDelete>
