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
const { descriptor } = parse(dataManagerSource, { filename: 'DataManagerView.vue' })
const template = descriptor.template?.content ?? ''

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
})
