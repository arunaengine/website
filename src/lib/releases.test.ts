import { describe, expect, it } from 'vitest'
import { releaseKey } from './releases'

describe('release file key', () => {
  it('makes a path safe key from the label', () => {
    expect(releaseKey('6.0 (full)')).toBe('release-6.0-full.json')
    expect(releaseKey('  ')).toBe('')
  })
})
