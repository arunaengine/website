import { describe, expect, it } from 'vitest'

import { artifactFilename, mergeJobReport, type ImportReportRow, type JobReportResponse } from './jobs'

function row(entryKey: string): ImportReportRow {
  return {
    entry_key: entryKey,
    code: 'imported',
    message: null,
    detail: {
      archive_path: entryKey,
      target_key: entryKey,
      version_id: null,
      blake3: null,
      size: null,
      arn: null,
      w3id: null,
      validation: null,
    },
  }
}

describe('mergeJobReport', () => {
  it('replaces the first page and appends later pages in order', () => {
    const stale: JobReportResponse = { rows: [row('stale')], next_cursor: 'old', report_digest: 'old' }
    const first = mergeJobReport(stale, {
      rows: [row('a')],
      next_cursor: 'next',
      report_digest: 'digest',
    }, false)
    expect(first).toEqual({ rows: [row('a')], next_cursor: 'next', report_digest: 'digest' })

    const second = mergeJobReport(first, {
      rows: [row('b')],
      report_digest: 'digest',
    }, true)
    expect(second).toEqual({ rows: [row('a'), row('b')], report_digest: 'digest' })
  })
})

describe('artifactFilename', () => {
  it('prefers and decodes filename star', () => {
    const headers = new Headers({
      'Content-Disposition': "attachment; filename=\"rocrate.zip\"; filename*=UTF-8''experiment%20%C3%A4.zip",
    })
    expect(artifactFilename(headers, 'fallback.zip')).toBe('experiment ä.zip')
  })

  it('falls back to the quoted filename', () => {
    const headers = new Headers({ 'Content-Disposition': 'attachment; filename="crate.zip"' })
    expect(artifactFilename(headers, 'fallback.zip')).toBe('crate.zip')
  })
})
