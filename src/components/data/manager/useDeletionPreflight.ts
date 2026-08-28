// Dataset-reference preflight shared by the deletion dialogs: one in-flight
// lookup at a time, so opening another destructive dialog cancels the previous
// one instead of rendering its result.
import { ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import {
  exactFileBacklinkPreflight,
  preflightBacklinks,
  type BacklinkPreflightResponse,
  type BacklinkPreflightStorageOperation,
  type BacklinkPreflightTarget,
} from '@/lib/backlinks'
import type { StorageDeletionScope } from '@/lib/storageDeletion'
import { errorMessage } from '@/lib/utils'

export const BULK_PREFLIGHT_CONCURRENCY = 16
const BULK_BACKLINK_LIMIT = 100

export interface BulkDeleteTarget {
  bucket: string
  nodeId: string | null
  keys: string[]
}

export interface BulkDeleteIssue {
  key: string
  message: string
}

export function useDeletionPreflight() {
  const { authToken } = useAruna()
  const s3 = useS3()

  const backlinkPreflight = ref<BacklinkPreflightResponse | null>(null)
  const backlinkPreflightBusy = ref(false)
  const backlinkPreflightError = ref<string | null>(null)
  let backlinkPreflightRequestId = 0
  let backlinkPreflightController: AbortController | undefined

  function permanentDeleteApiBase(nodeId: string | null): string | null {
    const context = s3.activeContext.value
    return context && context.nodeId === s3.nodeIdFor(nodeId) ? context.session.apiBase : null
  }

  function backlinkTargetForScope(
    scope: StorageDeletionScope,
    operation: BacklinkPreflightStorageOperation,
  ): BacklinkPreflightTarget {
    return {
      kind: 'bucket_prefix',
      bucket: scope.bucket,
      ...(scope.kind === 'file'
        ? { prefix: scope.key }
        : scope.kind === 'prefix'
          ? { prefix: scope.prefix }
          : {}),
      operation,
    }
  }

  function resetBacklinkPreflightState() {
    ++backlinkPreflightRequestId
    backlinkPreflightController?.abort()
    backlinkPreflightController = undefined
    backlinkPreflight.value = null
    backlinkPreflightBusy.value = false
    backlinkPreflightError.value = null
  }

  async function loadBacklinkPreflight(
    scope: StorageDeletionScope,
    operation: BacklinkPreflightStorageOperation,
    nodeId: string | null,
  ) {
    resetBacklinkPreflightState()
    const requestId = backlinkPreflightRequestId
    const apiBase = permanentDeleteApiBase(nodeId)
    if (!apiBase) {
      backlinkPreflightError.value = 'The node API endpoint for the dataset-reference lookup is unavailable.'
      return
    }
    const controller = new AbortController()
    backlinkPreflightController = controller
    backlinkPreflightBusy.value = true
    try {
      const response = await preflightBacklinks(
        { target: backlinkTargetForScope(scope, operation) },
        { baseUrl: apiBase, token: authToken.value || undefined },
        controller.signal,
      )
      if (requestId !== backlinkPreflightRequestId) return
      backlinkPreflight.value = scope.kind === 'file'
        ? exactFileBacklinkPreflight(response, scope.bucket, scope.key)
        : response
    } catch (error) {
      if (requestId !== backlinkPreflightRequestId || controller.signal.aborted) return
      backlinkPreflightError.value = errorMessage(error)
    } finally {
      if (requestId === backlinkPreflightRequestId) {
        backlinkPreflightBusy.value = false
        backlinkPreflightController = undefined
      }
    }
  }

  async function loadBulkBacklinkPreflight(
    target: BulkDeleteTarget,
    operation: BacklinkPreflightStorageOperation,
  ) {
    resetBacklinkPreflightState()
    const requestId = backlinkPreflightRequestId
    const apiBase = permanentDeleteApiBase(target.nodeId)
    if (!apiBase) {
      backlinkPreflightError.value = 'The node API endpoint for the dataset-reference lookup is unavailable.'
      return
    }
    const controller = new AbortController()
    backlinkPreflightController = controller
    backlinkPreflightBusy.value = true
    const responses: { key: string; response: BacklinkPreflightResponse }[] = []
    const failures: BulkDeleteIssue[] = []
    try {
      // The adapter accepts one bucket/prefix target. One bounded preflight phase
      // therefore resolves each selected file scope in small concurrent groups.
      for (let offset = 0; offset < target.keys.length; offset += BULK_PREFLIGHT_CONCURRENCY) {
        const keys = target.keys.slice(offset, offset + BULK_PREFLIGHT_CONCURRENCY)
        const settled = await Promise.allSettled(
          keys.map((key) =>
            preflightBacklinks(
              {
                target: backlinkTargetForScope(
                  { kind: 'file', bucket: target.bucket, key },
                  operation,
                ),
                limit: BULK_BACKLINK_LIMIT,
              },
              { baseUrl: apiBase, token: authToken.value || undefined },
              controller.signal,
            ),
          ),
        )
        if (requestId !== backlinkPreflightRequestId || controller.signal.aborted) return
        settled.forEach((result, index) => {
          const key = keys[index]
          if (result.status === 'fulfilled') responses.push({ key, response: result.value })
          else failures.push({
            key,
            message: errorMessage(result.reason),
          })
        })
      }
      if (requestId !== backlinkPreflightRequestId) return
      if (responses.length) {
        backlinkPreflight.value = mergeBulkBacklinkPreflights(
          target,
          responses,
          failures.length,
          operation,
        )
      }
      if (failures.length) {
        const first = failures[0]
        backlinkPreflightError.value = `${failures.length} of ${target.keys.length} selected key lookups failed. First failure: ${first.key}: ${first.message}`
      }
    } finally {
      if (requestId === backlinkPreflightRequestId) {
        backlinkPreflightBusy.value = false
        backlinkPreflightController = undefined
      }
    }
  }

  return {
    backlinkPreflight,
    backlinkPreflightBusy,
    backlinkPreflightError,
    permanentDeleteApiBase,
    resetBacklinkPreflightState,
    loadBacklinkPreflight,
    loadBulkBacklinkPreflight,
  }
}

export type DeletionPreflight = ReturnType<typeof useDeletionPreflight>

export function mergeBulkBacklinkPreflights(
  target: BulkDeleteTarget,
  responses: { key: string; response: BacklinkPreflightResponse }[],
  failed: number,
  operation: BacklinkPreflightStorageOperation,
): BacklinkPreflightResponse {
  const targets = new Map<string, BacklinkPreflightResponse['targets'][number]>()
  const nodeFreshness = new Map<string, BacklinkPreflightResponse['coverage']['node_freshness'][number]>()
  const excludedForms = new Map<string, BacklinkPreflightResponse['coverage']['excluded_forms'][number]>()
  const queriedForms = new Set<string>()
  const failedPartitions = new Set<string>()

  for (const { key, response } of responses) {
    for (const result of response.targets) {
      const targetedVersions = result.targeted_versions.filter(
        (location) => location.bucket === target.bucket && location.key === key,
      )
      if (!targetedVersions.length) continue
      const existing = targets.get(result.content_w3id)
      if (!existing) {
        targets.set(result.content_w3id, { ...result, targeted_versions: targetedVersions })
        continue
      }
      const locations = new Map(
        existing.targeted_versions.map((location) => [
          `${location.node_id}\n${location.bucket}\n${location.key}\n${location.version_id}`,
          location,
        ]),
      )
      for (const location of targetedVersions) {
        locations.set(
          `${location.node_id}\n${location.bucket}\n${location.key}\n${location.version_id}`,
          location,
        )
      }
      const references = new Map(
        existing.visible_references.map((reference) => [reference.document_id, reference]),
      )
      for (const reference of result.visible_references) {
        references.set(reference.document_id, reference)
      }
      const wouldRemoveLast =
        existing.would_remove_last_resolvable_aruna_location ||
        result.would_remove_last_resolvable_aruna_location
      targets.set(result.content_w3id, {
        ...existing,
        targeted_versions: [...locations.values()],
        visible_references: [...references.values()],
        hidden_references_exist:
          existing.hidden_references_exist || result.hidden_references_exist,
        would_remove_last_resolvable_aruna_location: wouldRemoveLast,
        location_impact_complete:
          existing.location_impact_complete &&
          result.location_impact_complete &&
          (operation !== 'all_versions_purge' || wouldRemoveLast),
      })
    }
    for (const freshness of response.coverage.node_freshness) {
      const existing = nodeFreshness.get(freshness.node_id)
      if (!existing || (existing.index_state === 'current' && freshness.index_state !== 'current')) {
        nodeFreshness.set(freshness.node_id, freshness)
      }
    }
    for (const excluded of response.coverage.excluded_forms) {
      excludedForms.set(`${excluded.form}\n${excluded.reason}`, excluded)
    }
    for (const form of response.coverage.queried_forms) queriedForms.add(form)
    for (const partition of response.failed_partitions) failedPartitions.add(partition)
  }

  const exactResponses = responses.every(({ key, response }) =>
    response.targets.every((result) =>
      result.targeted_versions.every(
        (location) => location.bucket !== target.bucket || location.key === key,
      ),
    ),
  )
  const completeResponses =
    failed === 0 && responses.length === target.keys.length && exactResponses
  return {
    targets: [...targets.values()],
    next_cursor: responses.find(({ response }) => response.next_cursor)?.response.next_cursor ?? null,
    truncated: failed > 0 || responses.some(({ response }) => response.truncated),
    nodes_queried: Math.max(0, ...responses.map(({ response }) => response.nodes_queried)),
    nodes_failed: Math.max(0, ...responses.map(({ response }) => response.nodes_failed)),
    complete: completeResponses && responses.every(({ response }) => response.complete),
    failed_partitions: [...failedPartitions],
    coverage: {
      queried_scope: 'selected_bucket_keys',
      queried_forms: [...queriedForms],
      excluded_forms: [...excludedForms.values()],
      node_freshness: [...nodeFreshness.values()],
      target_resolution_complete:
        completeResponses && responses.every(({ response }) => response.coverage.target_resolution_complete),
      path_style_endpoint_coverage_complete:
        completeResponses && responses.every(({ response }) => response.coverage.path_style_endpoint_coverage_complete),
      realm_coverage_complete:
        completeResponses && responses.every(({ response }) => response.coverage.realm_coverage_complete),
    },
  }
}
