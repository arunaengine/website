import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { exactFileBacklinkPreflight, type BacklinkPreflightResponse } from '@/lib/backlinks'

const dataManagerSource = readFileSync(
  fileURLToPath(new URL('./DataManagerView.vue', import.meta.url)),
  'utf8',
)
const s3ObjectsSource = readFileSync(
  fileURLToPath(new URL('../composables/s3/objects.ts', import.meta.url)),
  'utf8',
)
const backlinksSource = readFileSync(
  fileURLToPath(new URL('../lib/backlinks.ts', import.meta.url)),
  'utf8',
)
const stagingReferencesSource = readFileSync(
  fileURLToPath(new URL('../composables/useStagingReferences.ts', import.meta.url)),
  'utf8',
)
const crateReferencesSource = readFileSync(
  fileURLToPath(new URL('../composables/useCrateReferences.ts', import.meta.url)),
  'utf8',
)
const datasetReferencesSource = readFileSync(
  fileURLToPath(new URL('../components/data/DatasetReferencesPreflightPanel.vue', import.meta.url)),
  'utf8',
)
const managerSource = readFileSync(
  fileURLToPath(new URL('../composables/useDataManager.ts', import.meta.url)),
  'utf8',
)
const preflightSource = readFileSync(
  fileURLToPath(new URL('../components/data/manager/useDeletionPreflight.ts', import.meta.url)),
  'utf8',
)
const deletionFlowSource = readFileSync(
  fileURLToPath(new URL('../components/data/manager/DeletionFlow.vue', import.meta.url)),
  'utf8',
)
const bulkDeleteSource = readFileSync(
  fileURLToPath(new URL('../components/data/manager/BulkDeleteDialog.vue', import.meta.url)),
  'utf8',
)
const objectBrowserSource = readFileSync(
  fileURLToPath(new URL('../components/data/manager/ObjectBrowser.vue', import.meta.url)),
  'utf8',
)

function sfc(source: string, filename: string) {
  const { descriptor } = parse(source, { filename })
  return {
    template: descriptor.template?.content ?? '',
    script: descriptor.scriptSetup?.content ?? '',
  }
}

const dataManager = sfc(dataManagerSource, 'DataManagerView.vue')
const deletionFlow = sfc(deletionFlowSource, 'DeletionFlow.vue')
const bulkDelete = sfc(bulkDeleteSource, 'BulkDeleteDialog.vue')
const objectBrowser = sfc(objectBrowserSource, 'ObjectBrowser.vue')
const datasetReferencesTemplate = sfc(
  datasetReferencesSource,
  'DatasetReferencesPreflightPanel.vue',
).template

// Handles both top-level and composable-scoped (indented) declarations.
function functionSource(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  const end = source.slice(start + 1).search(/\n\s*(?:async )?function /)
  return end < 0 ? source.slice(start) : source.slice(start, start + 1 + end)
}

function buttonOpeningTag(template: string, handler: string): string {
  const click = template.indexOf(`@click="${handler}"`)
  const start = template.lastIndexOf('<Button', click)
  const end = template.indexOf('>', click)
  return template.slice(start, end + 1)
}

describe('Data Manager version-aware deletion', () => {
  it('renders the bounded preflight counts, truncation, permissions, and bucket sync side effect', () => {
    for (const label of [
      'Current heads',
      'Noncurrent versions',
      'Delete markers',
      'Open multipart uploads',
    ]) {
      expect(deletionFlowSource).toContain(label)
    }
    expect(deletionFlow.template).toContain('!permanentDeletePreflight.counts.complete')
    expect(deletionFlow.template).toContain('more than shown')
    expect(deletionFlow.template).toContain('permanentDeletePreflight.truncation.versions_truncated')
    expect(deletionFlow.template).toContain('permanentDeletePreflight.truncation.multipart_uploads_truncated')
    expect(deletionFlow.template).toContain('permanentDeletePreflight.permissions.read')
    expect(deletionFlow.template).toContain('permanentDeletePreflight.permissions.purge')
    expect(deletionFlow.template).toContain('sync_relationships_apply_to_bucket_delete')
    expect(deletionFlow.template).toContain('Sync-relationship removal')
    expect(deletionFlow.template).toContain('This confirmed side effect is not a blocker.')
    expect(deletionFlow.template).not.toContain('relationship.blocker')
  })

  it('routes every permanent scope through one job and keeps partial progress visible', () => {
    expect(objectBrowser.template).toContain('Permanently delete all versions')
    expect(objectBrowser.template).toContain('Permanently delete folder and all versions')
    expect(deletionFlowSource).toContain("{ kind: 'bucket', bucket: name }")
    expect(deletionFlowSource).toContain('startStoragePurge(')
    expect(deletionFlowSource).toContain('getStoragePurgeJob(')
    expect(deletionFlowSource).toContain('retainStoragePurgeProgress(')
    expect(deletionFlow.template).toContain('Committed entries from completed batches:')
    expect(deletionFlow.template).toContain('Work committed by completed batches remains deleted.')
    expect(deletionFlow.template).toContain('Remaining after refresh')
    expect(deletionFlow.template).toContain('Retry purge')
    expect(deletionFlow.template).toContain('Reusing the existing purge for this retry.')
    expect(deletionFlowSource).toContain('target.operation,')
  })

  it('keeps ordinary file and folder deletion version-less and truthfully worded', () => {
    expect(s3ObjectsSource).toContain(
      'new DeleteObjectCommand({ Bucket: bucket, Key: key })',
    )
    expect(s3ObjectsSource).toContain(
      'Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: false }',
    )
    expect(s3ObjectsSource).not.toContain('ListObjectVersionsCommand')
    // Reading a PUT's version id is fine; a delete must never send one.
    expect(s3ObjectsSource).not.toContain('VersionId:')
    expect(deletionFlow.template).toContain(
      'Delete markers are written for current objects; earlier versions stay retrievable by version ID.',
    )
    expect(deletionFlow.template).toContain(
      'A delete marker is written; earlier versions stay retrievable by version ID.',
    )
    expect(deletionFlow.template).not.toContain('ALL objects under it are permanently deleted.')
  })

  it('runs the distributed partial-tolerant reference preflight before every destructive dialog', () => {
    expect(backlinksSource).toContain("'/metadata/references/preflight'")
    expect(backlinksSource).toContain("mode: request.mode ?? 'distributed'")
    expect(backlinksSource).toContain('allow_partial: request.allow_partial ?? true')

    for (const name of ['openDeleteObject', 'openDeleteFolder']) {
      const source = functionSource(deletionFlow.script, name)
      expect(source).toContain('loadBacklinkPreflight(')
      expect(source).toContain("'latest_version_tombstone'")
      expect(source.indexOf('loadBacklinkPreflight(')).toBeLessThan(source.indexOf('deleteTarget.value = target'))
    }

    const permanent = functionSource(deletionFlow.script, 'openPermanentDelete')
    expect(permanent).toContain("loadBacklinkPreflight(scope, 'all_versions_purge', nodeId)")
    expect(permanent.indexOf('loadBacklinkPreflight(')).toBeLessThan(
      permanent.indexOf('permanentDeleteTarget.value = target'),
    )
    expect(functionSource(deletionFlow.script, 'openPermanentDeleteObject')).toContain('openPermanentDelete(')
    expect(functionSource(deletionFlow.script, 'openPermanentDeleteFolder')).toContain('openPermanentDelete(')
    expect(functionSource(deletionFlow.script, 'openDeleteBucket')).toContain('openPermanentDelete(')
  })

  it('drops a sibling-key result before a single-file preflight can render it', () => {
    const response = {
      targets: [{
        content_w3id: 'https://w3id.org/aruna/data/sibling',
        targeted_versions: [{ node_id: 'node-a', bucket: 'data', key: 'foo.bar', version_id: 'v1' }],
        visible_references: [{ document_id: 'sibling-doc', title: 'Sibling dataset' }],
        hidden_references_exist: false,
        would_remove_last_resolvable_aruna_location: true,
        location_impact_complete: true,
      }],
      next_cursor: null,
      truncated: false,
      nodes_queried: 1,
      nodes_failed: 0,
      complete: true,
      failed_partitions: [],
      coverage: {
        queried_scope: 'bucket_prefix',
        queried_forms: ['contentUrl'],
        excluded_forms: [],
        node_freshness: [{ node_id: 'node-a', index_state: 'current', oldest_status_updated_at_ms: null }],
        target_resolution_complete: true,
        path_style_endpoint_coverage_complete: true,
        realm_coverage_complete: true,
      },
    } satisfies BacklinkPreflightResponse

    const filtered = exactFileBacklinkPreflight(response, 'data', 'foo')

    expect(filtered.targets).toEqual([])
    expect(filtered.complete).toBe(false)
    expect(filtered.coverage).toMatchObject({
      target_resolution_complete: false,
      path_style_endpoint_coverage_complete: false,
      realm_coverage_complete: false,
    })
    expect(functionSource(preflightSource, 'loadBacklinkPreflight')).toContain(
      'exactFileBacklinkPreflight(response, scope.bucket, scope.key)',
    )
  })

  it('renders visible, restricted, last-location, and partial coverage warnings in all dialogs', () => {
    expect(
      `${deletionFlow.template}${bulkDelete.template}`.match(/<DatasetReferencesPreflightPanel/g),
    ).toHaveLength(3)
    expect(datasetReferencesTemplate).toContain('aria-label="Dataset references"')
    expect(datasetReferencesTemplate).not.toContain('RDF Dataset references')
    expect(datasetReferencesTemplate).toContain("params: { id: reference.document_id }")
    expect(datasetReferencesTemplate).toContain('{{ reference.title }}')
    expect(datasetReferencesTemplate).toContain('Other restricted datasets reference this content')
    expect(datasetReferencesTemplate).toContain('target.would_remove_last_resolvable_aruna_location')
    expect(datasetReferencesTemplate).toContain("This operation would remove this content's last resolvable Aruna location.")
    expect(datasetReferencesTemplate).toContain('Dataset-reference coverage is partial.')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.queried_scope')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.queried_forms')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.node_freshness')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.excluded_forms')
  })

  it('renders failed staging lookup as failed instead of a successful empty result', () => {
    expect(stagingReferencesSource).toContain("'unknown' | 'loading' | 'loaded' | 'error'")
    expect(stagingReferencesSource).toContain("status.value = 'error'")
    expect(stagingReferencesSource).toContain('error.value = errorMessage(caught)')
    expect(deletionFlow.template.match(/aria-label="Source bindings"/g)).toHaveLength(2)
    const sourceBindings = deletionFlow.template.slice(
      deletionFlow.template.indexOf('aria-label="Source bindings"'),
      deletionFlow.template.indexOf('</section>', deletionFlow.template.indexOf('aria-label="Source bindings"')),
    )
    expect(sourceBindings).toContain("destructiveSourceReferences.status.value === 'error'")
    expect(sourceBindings).toContain('Source-binding lookup failed.')
    expect(sourceBindings.indexOf('Source-binding lookup failed.')).toBeLessThan(
      sourceBindings.indexOf('No source bindings were found for this scope.'),
    )
  })

  it('keeps warnings advisory and uses one confirmation without a typed override', () => {
    const ordinaryConfirm = buttonOpeningTag(deletionFlow.template, 'confirmDelete')
    const permanentConfirm = buttonOpeningTag(deletionFlow.template, 'confirmPermanentDelete')
    const bulkConfirm = buttonOpeningTag(bulkDelete.template, 'confirmBulkDelete')
    for (const button of [ordinaryConfirm, permanentConfirm, bulkConfirm]) {
      expect(button).not.toContain('backlinkPreflightPartial')
      expect(button).not.toContain('backlinkPreflightError')
      expect(button).not.toContain('hidden_references_exist')
      expect(button).not.toContain('would_remove_last_resolvable_aruna_location')
      expect(button).not.toContain('backlinkPreflightBusy')
    }
    expect(deletionFlowSource).not.toContain('permanentDeleteConfirm')
    expect(deletionFlow.template).not.toContain('placeholder="bucket name"')
  })

  it('keeps the cache-backed reverse index explicitly labelled as non-authoritative', () => {
    expect(crateReferencesSource).toContain("'Referenced by loaded metadata'")
    expect(crateReferencesSource).toContain('never the whole realm')
  })
})

describe('Data Manager explicit multi-file deletion', () => {
  it('keeps selection in the Data Manager listing and preserves it across refreshes', () => {
    expect(managerSource).toContain('const selectedObjectKeys = ref<Set<string>>(new Set())')
    expect(objectBrowser.template).toContain('aria-label="Select all listed objects"')
    expect(objectBrowser.template).toContain(':checked="selectedObjectKeys.has(object.key)"')
    expect(objectBrowser.template).toContain('Delete selected ({{ selectedObjectCount }})')

    expect(functionSource(managerSource, 'clearObjectListing')).toContain('selectedObjectKeys.value = new Set()')
    expect(functionSource(managerSource, 'loadObjects')).not.toContain('selectedObjectKeys.value = new Set()')

    const prune = functionSource(managerSource, 'pruneSelectedObjectKeys')
    expect(prune).toContain("scope.kind === 'bucket'")
    expect(prune).toContain('key.startsWith(scope.prefix)')
    expect(functionSource(deletionFlow.script, 'confirmDelete')).toContain("{ kind: 'prefix', bucket: target.bucket, prefix: target.folder.prefix }")
    expect(functionSource(deletionFlow.script, 'refreshAfterPermanentDelete')).toContain(
      'pruneSelectedObjectKeys(scope, target.nodeId)',
    )
  })

  it('runs one bounded selection preflight phase and renders every D5 warning class', () => {
    const open = functionSource(bulkDelete.script, 'openBulkDelete')
    const preflight = functionSource(preflightSource, 'loadBulkBacklinkPreflight')
    const merge = functionSource(preflightSource, 'mergeBulkBacklinkPreflights')
    expect(open).toContain("loadBulkBacklinkPreflight(target, 'latest_version_tombstone')")
    expect(preflight).toContain('target.keys.slice(offset, offset + BULK_PREFLIGHT_CONCURRENCY)')
    expect(preflight).toContain("{ kind: 'file', bucket: target.bucket, key }")
    expect(preflight).toContain('limit: BULK_BACKLINK_LIMIT')
    expect(merge).toContain('location.bucket === target.bucket && location.key === key')
    expect(merge).toContain('location.bucket !== target.bucket || location.key === key')
    expect(datasetReferencesTemplate).toContain('Dataset-reference lookup failed for part or all of the selection.')
    expect(datasetReferencesTemplate).toContain('Other restricted datasets reference this content')
    expect(datasetReferencesTemplate).toContain("This operation would remove this content's last resolvable Aruna location.")
    expect(datasetReferencesTemplate).toContain('Dataset-reference coverage is partial.')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.node_freshness')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.excluded_forms')
  })

  it('caps ordinary batches and retains exact mixed-success and transport outcomes', () => {
    const ordinary = functionSource(bulkDelete.script, 'deleteSelectedOrdinary')
    const retain = functionSource(bulkDelete.script, 'recordBulkDeleteResults')
    expect(bulkDelete.script).toContain('const BULK_DELETE_BATCH_SIZE = 1_000')
    expect(ordinary).toContain('keys.slice(offset, offset + BULK_DELETE_BATCH_SIZE)')
    expect(ordinary).toContain('Promise.allSettled(')
    expect(ordinary).toContain('s3.deleteObject(target.bucket, key, target.nodeId)')
    expect(ordinary).toContain('status: bulkDeleteFailureStatus(result.reason)')
    expect(functionSource(bulkDelete.script, 'bulkDeleteFailureStatus')).toContain("return 'unknown'")
    expect(retain).toContain("if (result.status === 'committed') nextSelection.delete(result.key)")
    expect(retain).not.toContain("if (result.status === 'failed') nextSelection.delete(result.key)")
    expect(retain).not.toContain("if (result.status === 'unknown') nextSelection.delete(result.key)")
    expect(bulkDelete.template).toContain('Committed keys')
    expect(bulkDelete.template).toContain('Failed keys stay selected for review or retry.')
    expect(bulkDelete.template).toContain('Unknown keys stay selected for review or retry.')
  })

  it('keeps folder deletion separate and offers both selected-file semantics', () => {
    expect(bulkDelete.template).toContain('Delete markers for {{ bulkDeleteTarget.keys.length }} selected key')
    expect(bulkDelete.template).toContain('Permanently purge all versions for {{ bulkDeleteTarget.keys.length }} selected key')
    expect(functionSource(bulkDelete.script, 'loadBulkPurgePreflights')).toContain('getStorageDeletionPreflight(')
    expect(functionSource(bulkDelete.script, 'loadBulkPurgePreflights')).toContain("{ kind: 'file', bucket: target.bucket, key }")
    expect(functionSource(bulkDelete.script, 'deleteSelectedPermanently')).toContain('runBulkPurgeScope(')
    expect(functionSource(bulkDelete.script, 'runBulkPurgeScope')).toContain('startStoragePurge(')
    expect(functionSource(deletionFlow.script, 'openDeleteFolder')).not.toContain('selectedObjectKeys')
    expect(functionSource(deletionFlow.script, 'openPermanentDeleteFolder')).not.toContain('selectedObjectKeys')
    expect(objectBrowser.template.match(/<Bomb class="size-3\.5"/g)).toHaveLength(2)
  })

  it('keeps new UI copy free of em dashes and the retired label namespace', () => {
    const renderedTemplate = [
      dataManager.template,
      deletionFlow.template,
      bulkDelete.template,
      objectBrowser.template,
      datasetReferencesTemplate,
    ]
      .join('\n')
      .replace(/<!--[\s\S]*?-->/g, '')
    expect(renderedTemplate).not.toContain('\u2014')
    for (const source of [dataManagerSource, managerSource, deletionFlowSource, bulkDeleteSource, objectBrowserSource]) {
      expect(source).not.toMatch(/aruna[.]io/)
    }
  })
})
