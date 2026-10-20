import { describe, expect, it } from 'vitest'
import { fileChecksums } from './checksums'

describe('fileChecksums', () => {
  it('lists every stored checksum in a fixed order with readable names', () => {
    const rows = fileChecksums({
      checksums: [
        { type: 'crc32', checksum: '0A0B0C0D' },
        { type: 'md5', checksum: 'aa'.repeat(16) },
        { type: 'xxh3', checksum: 'ff'.repeat(8) },
        { type: 'sha256', checksum: 'bb'.repeat(32) },
        { type: 'blake3', checksum: 'cc'.repeat(32) },
      ],
    })
    expect(rows).toEqual([
      { label: 'BLAKE3', value: 'cc'.repeat(32) },
      { label: 'SHA-256', value: 'bb'.repeat(32) },
      { label: 'MD5', value: 'aa'.repeat(16) },
      { label: 'CRC32', value: '0a0b0c0d' },
      { label: 'XXH3', value: 'ff'.repeat(8) },
    ])
  })

  it('skips entries without a type or value', () => {
    expect(fileChecksums({ checksums: [{ type: 'sha1' }, { checksum: 'ab' }] })).toEqual([])
    expect(fileChecksums({})).toEqual([])
  })
})
