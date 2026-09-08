import { describe, expect, it } from 'vitest'
import { displayArchiveRows, type ExportReportRow } from './rocrateArchive'

const included: ExportReportRow = {
  entry_key: '0:main', code: 'included', detail: { entity_id: 'source', zip_path: 'results/file.csv' },
}
const generated: ExportReportRow = {
  ...included, entry_key: '0:path', code: 'path_synthesized',
  message: 'unsafe, absent, or reserved localPath was synthesized',
}

describe('archive report presentation', () => {
  it('shows the included file and its path without a redundant generated-path notice', () => {
    expect(displayArchiveRows([included, generated])).toEqual([included])
    expect(generated.code).toBe('path_synthesized')
  })

  it('keeps an unavailable path visible with a readable explanation', () => {
    const [row] = displayArchiveRows([{ ...generated, detail: { entity_id: 'source' } }])
    expect(row.code).toBe('Archive path')
    expect(row.message).toBe('No archive path was produced.')
  })

  it('preserves omissions and validation problems even when a path is present', () => {
    const denied = { ...included, entry_key: '1:main', code: 'denied' }
    const invalid = { ...generated, detail: { ...generated.detail, validation: {
      code: 'invalid_path', message: 'The path is invalid.', pointer: '/@graph/1/@id',
    } } }
    const rows = displayArchiveRows([denied, invalid])
    expect(rows[0]).toEqual(denied)
    expect(rows[1].detail.validation).toEqual(invalid.detail.validation)
    expect(rows[1].message).toBe('The archive path needs attention.')
  })
})
