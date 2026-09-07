import { describe, expect, it } from 'vitest'
import { parseRunCrate } from '@/lib/runCrate'
import { contextVersion, DEFAULT_CRATE_VERSION } from '@/lib/crate/version'
import { snapshotCrate } from './capture'

describe('notebook snapshot run-crate', () => {
  it('describes snapshot creation and links the exact notebook payload', () => {
    const contentId = `https://w3id.org/aruna/data/${'a'.repeat(64)}`
    const contentUrl = 's3://lab/notebooks/captures/fixed.ipynb?versionId=version-1'
    const crate = snapshotCrate({ id: 'capture-1', name: 'Analysis', contentId, contentUrl, bytes: 123, author: 'author-1', started: '2026-09-07T10:00:00Z', finished: '2026-09-07T10:00:01Z' })
    expect(contextVersion(crate['@context'])).toBe(DEFAULT_CRATE_VERSION)
    const parsed = parseRunCrate(crate, 'captures/notebooks/capture-1')
    expect(parsed).toMatchObject({ actionName: 'Capture Analysis', instrument: { name: 'Aruna Portal' }, outputs: [{ id: contentId, contentUrl, contentSize: '123', name: 'Analysis.ipynb' }] })
    expect(parsed?.runId).toBeUndefined()
    expect(parsed?.actionStatus).toContain('CompletedActionStatus')
  })
})
