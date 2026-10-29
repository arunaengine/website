import { describe, expect, it } from 'vitest'
import { releaseKey, versionTime } from './releases'

describe('release file key', () => {
  it('makes a path safe key from the label', () => {
    expect(releaseKey('6.0 (full)')).toBe('release-6.0-full.json')
    expect(releaseKey('  ')).toBe('')
  })
})

describe('version time', () => {
  it('reads the time a version id was minted at', () => {
    expect(versionTime('01M62DCH5J7HXR3V6784DBERPA')?.toISOString()).toBe('2026-10-28T23:26:37.234Z')
  })

  it('knows no time for an id that is not a ULID', () => {
    expect(versionTime('null')).toBeNull()
    expect(versionTime('v1')).toBeNull()
  })
})
