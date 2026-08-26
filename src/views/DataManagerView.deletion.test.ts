import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { exactFileBacklinkPreflight, type BacklinkPreflightResponse } from '@/lib/backlinks'

const dataManagerSource = readFileSync(
  fileURLToPath(new URL('./DataManagerView.vue', import.meta.url)),
  'utf8',
)
const useS3Source = readFileSync(
  fileURLToPath(new URL('../composables/useS3.ts', import.meta.url)),
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
const { descriptor } = parse(dataManagerSource, { filename: 'DataManagerView.vue' })
const template = descriptor.template?.content ?? ''
const script = descriptor.scriptSetup?.content ?? ''
const { descriptor: datasetReferencesDescriptor } = parse(datasetReferencesSource, {
  filename: 'DatasetReferencesPreflightPanel.vue',
})
const datasetReferencesTemplate = datasetReferencesDescriptor.template?.content ?? ''

function functionSource(name: string): string {
  const start = script.indexOf(`function ${name}(`)
  const end = script.indexOf('\nfunction ', start + 1)
  return script.slice(start, end < 0 ? undefined : end)
}

function buttonOpeningTag(handler: string): string {
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
      expect(dataManagerSource).toContain(label)
    }
    expect(template).toContain('!permanentDeletePreflight.counts.complete')
    expect(template).toContain('more than shown')
    expect(template).toContain('permanentDeletePreflight.truncation.versions_truncated')
    expect(template).toContain('permanentDeletePreflight.truncation.multipart_uploads_truncated')
    expect(template).toContain('permanentDeletePreflight.permissions.read')
    expect(template).toContain('permanentDeletePreflight.permissions.purge')
    expect(template).toContain('sync_relationships_apply_to_bucket_delete')
    expect(template).toContain('Sync-relationship removal')
    expect(template).toContain('This confirmed side effect is not a blocker.')
    expect(template).not.toContain('relationship.blocker')
  })

  it('routes every permanent scope through one job and keeps partial progress visible', () => {
    expect(template).toContain('Permanently delete all versions')
    expect(template).toContain('Permanently delete folder and all versions')
    expect(dataManagerSource).toContain("{ kind: 'bucket', bucket: name }")
    expect(dataManagerSource).toContain('startStoragePurge(')
    expect(dataManagerSource).toContain('getStoragePurgeJob(')
    expect(dataManagerSource).toContain('retainStoragePurgeProgress(')
    expect(template).toContain('Committed entries from completed batches:')
    expect(template).toContain('Work committed by completed batches remains deleted.')
    expect(template).toContain('Remaining after refresh')
    expect(template).toContain('Retry purge')
    expect(template).toContain('Reusing the existing purge job for this retry.')
    expect(dataManagerSource).toContain('target.operation,')
  })

  it('keeps ordinary file and folder deletion version-less and truthfully worded', () => {
    expect(useS3Source).toContain(
      'new DeleteObjectCommand({ Bucket: bucket, Key: key })',
    )
    expect(useS3Source).toContain(
      'Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: false }',
    )
    expect(useS3Source).not.toContain('ListObjectVersionsCommand')
    expect(useS3Source).not.toContain('VersionId')
    expect(template).toContain(
      'Delete markers are written for current objects; earlier versions stay retrievable by version ID.',
    )
    expect(template).toContain(
      'A delete marker is written; earlier versions stay retrievable by version ID.',
    )
    expect(template).not.toContain('ALL objects under it are permanently deleted.')
  })

  it('runs the distributed partial-tolerant reference preflight before every destructive dialog', () => {
    expect(backlinksSource).toContain("'/metadata/references/preflight'")
    expect(backlinksSource).toContain("mode: request.mode ?? 'distributed'")
    expect(backlinksSource).toContain('allow_partial: request.allow_partial ?? true')

    for (const name of ['openDeleteObject', 'openDeleteFolder']) {
      const source = functionSource(name)
      expect(source).toContain('loadBacklinkPreflight(')
      expect(source).toContain("'latest_version_tombstone'")
      expect(source.indexOf('loadBacklinkPreflight(')).toBeLessThan(source.indexOf('deleteTarget.value = target'))
    }

    const permanent = functionSource('openPermanentDelete')
    expect(permanent).toContain("loadBacklinkPreflight(scope, 'all_versions_purge', nodeId)")
    expect(permanent.indexOf('loadBacklinkPreflight(')).toBeLessThan(
      permanent.indexOf('permanentDeleteTarget.value = target'),
    )
    expect(functionSource('openPermanentDeleteObject')).toContain('openPermanentDelete(')
    expect(functionSource('openPermanentDeleteFolder')).toContain('openPermanentDelete(')
    expect(functionSource('openDeleteBucket')).toContain('openPermanentDelete(')
  })

  it('drops a sibling-key result before a single-file preflight can render it', () => {
    const response = {
      targets: [{
        content_w3id: 'https://w3id.org/aruna/data/sibling',
        targeted_versions: [{ node_id: 'node-a', bucket: 'data', key: 'foo.bar', version_id: 'v1' }],
        visible_references: [{ document_id: 'sibling-doc', title: 'Sibling Dataset' }],
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
    expect(functionSource('loadBacklinkPreflight')).toContain(
      'exactFileBacklinkPreflight(response, scope.bucket, scope.key)',
    )
  })

  it('renders visible, restricted, last-location, and partial coverage warnings in all dialogs', () => {
    expect(template.match(/<DatasetReferencesPreflightPanel/g)).toHaveLength(3)
    expect(datasetReferencesTemplate).toContain('aria-label="Dataset references"')
    expect(datasetReferencesTemplate).not.toContain('RDF Dataset references')
    expect(datasetReferencesTemplate).toContain("params: { id: reference.document_id }")
    expect(datasetReferencesTemplate).toContain('{{ reference.title }}')
    expect(datasetReferencesTemplate).toContain('Other restricted Datasets reference this content')
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
    expect(stagingReferencesSource).toContain('error.value = caught instanceof Error')
    expect(template.match(/aria-label="Source bindings"/g)).toHaveLength(2)
    const sourceBindings = template.slice(
      template.indexOf('aria-label="Source bindings"'),
      template.indexOf('</section>', template.indexOf('aria-label="Source bindings"')),
    )
    expect(sourceBindings).toContain("destructiveSourceReferences.status.value === 'error'")
    expect(sourceBindings).toContain('Source-binding lookup failed.')
    expect(sourceBindings.indexOf('Source-binding lookup failed.')).toBeLessThan(
      sourceBindings.indexOf('No source bindings were found for this scope.'),
    )
  })

  it('keeps warnings advisory and uses one confirmation without a typed override', () => {
    const ordinaryConfirm = buttonOpeningTag('confirmDelete')
    const permanentConfirm = buttonOpeningTag('confirmPermanentDelete')
    const bulkConfirm = buttonOpeningTag('confirmBulkDelete')
    for (const button of [ordinaryConfirm, permanentConfirm, bulkConfirm]) {
      expect(button).not.toContain('backlinkPreflightPartial')
      expect(button).not.toContain('backlinkPreflightError')
      expect(button).not.toContain('hidden_references_exist')
      expect(button).not.toContain('would_remove_last_resolvable_aruna_location')
      expect(button).not.toContain('backlinkPreflightBusy')
    }
    expect(dataManagerSource).not.toContain('permanentDeleteConfirm')
    expect(template).not.toContain('placeholder="bucket name"')
  })

  it('keeps the cache-backed reverse index explicitly labelled as non-authoritative', () => {
    expect(crateReferencesSource).toContain("'Referenced by loaded metadata'")
    expect(crateReferencesSource).toContain('never the whole realm')
  })
})

describe('Data Manager explicit multi-file deletion', () => {
  it('keeps selection in the Data Manager listing and preserves it across refreshes', () => {
    expect(script).toContain('const selectedObjectKeys = ref<Set<string>>(new Set())')
    expect(template).toContain('aria-label="Select all listed objects"')
    expect(template).toContain(':checked="selectedObjectKeys.has(object.key)"')
    expect(template).toContain('Delete selected ({{ selectedObjectCount }})')

    expect(functionSource('clearObjectListing')).toContain('selectedObjectKeys.value = new Set()')
    expect(functionSource('loadObjects')).not.toContain('selectedObjectKeys.value = new Set()')

    const prune = functionSource('pruneSelectedObjectKeys')
    expect(prune).toContain("scope.kind === 'bucket'")
    expect(prune).toContain('key.startsWith(scope.prefix)')
    expect(functionSource('confirmDelete')).toContain("{ kind: 'prefix', bucket: target.bucket, prefix: target.folder.prefix }")
    expect(functionSource('refreshAfterPermanentDelete')).toContain(
      'pruneSelectedObjectKeys(scope, target.nodeId)',
    )
  })

  it('runs one bounded selection preflight phase and renders every D5 warning class', () => {
    const open = functionSource('openBulkDelete')
    const preflight = functionSource('loadBulkBacklinkPreflight')
    const merge = functionSource('mergeBulkBacklinkPreflights')
    expect(open).toContain("loadBulkBacklinkPreflight(target, 'latest_version_tombstone')")
    expect(preflight).toContain('target.keys.slice(offset, offset + BULK_PREFLIGHT_CONCURRENCY)')
    expect(preflight).toContain("{ kind: 'file', bucket: target.bucket, key }")
    expect(preflight).toContain('limit: BULK_BACKLINK_LIMIT')
    expect(merge).toContain('location.bucket === target.bucket && location.key === key')
    expect(merge).toContain('location.bucket !== target.bucket || location.key === key')
    expect(datasetReferencesTemplate).toContain('Dataset-reference lookup failed for part or all of the selection.')
    expect(datasetReferencesTemplate).toContain('Other restricted Datasets reference this content')
    expect(datasetReferencesTemplate).toContain("This operation would remove this content's last resolvable Aruna location.")
    expect(datasetReferencesTemplate).toContain('Dataset-reference coverage is partial.')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.node_freshness')
    expect(datasetReferencesTemplate).toContain('preflight.coverage.excluded_forms')
  })

  it('caps ordinary batches and retains exact mixed-success and transport outcomes', () => {
    const ordinary = functionSource('deleteSelectedOrdinary')
    const retain = functionSource('recordBulkDeleteResults')
    expect(script).toContain('const BULK_DELETE_BATCH_SIZE = 1_000')
    expect(ordinary).toContain('keys.slice(offset, offset + BULK_DELETE_BATCH_SIZE)')
    expect(ordinary).toContain('Promise.allSettled(')
    expect(ordinary).toContain('s3.deleteObject(target.bucket, key, target.nodeId)')
    expect(ordinary).toContain('status: bulkDeleteFailureStatus(result.reason)')
    expect(functionSource('bulkDeleteFailureStatus')).toContain("return 'unknown'")
    expect(retain).toContain("if (result.status === 'committed') nextSelection.delete(result.key)")
    expect(retain).not.toContain("if (result.status === 'failed') nextSelection.delete(result.key)")
    expect(retain).not.toContain("if (result.status === 'unknown') nextSelection.delete(result.key)")
    expect(template).toContain('Committed keys')
    expect(template).toContain('Failed keys stay selected for review or retry.')
    expect(template).toContain('Unknown keys stay selected for review or retry.')
  })

  it('keeps folder deletion separate and offers both selected-file semantics', () => {
    expect(template).toContain('Delete markers for {{ bulkDeleteTarget.keys.length }} selected key')
    expect(template).toContain('Permanently purge all versions for {{ bulkDeleteTarget.keys.length }} selected key')
    expect(functionSource('loadBulkPurgePreflights')).toContain('getStorageDeletionPreflight(')
    expect(functionSource('loadBulkPurgePreflights')).toContain("{ kind: 'file', bucket: target.bucket, key }")
    expect(functionSource('deleteSelectedPermanently')).toContain('runBulkPurgeScope(')
    expect(functionSource('runBulkPurgeScope')).toContain('startStoragePurge(')
    expect(functionSource('openDeleteFolder')).not.toContain('selectedObjectKeys')
    expect(functionSource('openPermanentDeleteFolder')).not.toContain('selectedObjectKeys')
    expect(template.match(/<Bomb class="size-3\.5"/g)).toHaveLength(2)
  })

  it('keeps new UI copy free of em dashes and the retired label namespace', () => {
    const renderedTemplate = `${template}\n${datasetReferencesTemplate}`.replace(/<!--[\s\S]*?-->/g, '')
    expect(renderedTemplate).not.toContain('\u2014')
    expect(dataManagerSource).not.toMatch(/aruna[.]io/)
  })
})
