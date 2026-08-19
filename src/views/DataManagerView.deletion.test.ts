import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

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
const { descriptor } = parse(dataManagerSource, { filename: 'DataManagerView.vue' })
const template = descriptor.template?.content ?? ''
const script = descriptor.scriptSetup?.content ?? ''

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

  it('renders visible, restricted, last-location, and partial coverage warnings in both dialogs', () => {
    expect(template.match(/aria-label="RDF Dataset references"/g)).toHaveLength(2)
    expect(template).toContain("params: { id: reference.document_id }")
    expect(template).toContain('{{ reference.title }}')
    expect(template).toContain('Other restricted Datasets reference this content')
    expect(template).toContain('target.would_remove_last_resolvable_aruna_location')
    expect(template).toContain("This operation would remove this content's last resolvable Aruna location.")
    expect(template).toContain('Dataset-reference coverage is partial.')
    expect(template).toContain('backlinkPreflight.coverage.queried_scope')
    expect(template).toContain('backlinkPreflight.coverage.queried_forms')
    expect(template).toContain('backlinkPreflight.coverage.node_freshness')
    expect(template).toContain('backlinkPreflight.coverage.excluded_forms')
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
    for (const button of [ordinaryConfirm, permanentConfirm]) {
      expect(button).not.toContain('backlinkPreflightPartial')
      expect(button).not.toContain('backlinkPreflightError')
      expect(button).not.toContain('hidden_references_exist')
      expect(button).not.toContain('would_remove_last_resolvable_aruna_location')
    }
    expect(dataManagerSource).not.toContain('permanentDeleteConfirm')
    expect(template).not.toContain('placeholder="bucket name"')
  })

  it('keeps the cache-backed reverse index explicitly labelled as non-authoritative', () => {
    expect(crateReferencesSource).toContain("'Referenced by loaded metadata'")
    expect(crateReferencesSource).toContain('never the whole realm')
  })
})
