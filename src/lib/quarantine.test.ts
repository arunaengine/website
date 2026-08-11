import { describe, expect, it } from 'vitest'
import { isHexKey } from './quarantine'

describe('isHexKey', () => {
  it('accepts even-length hex', () => {
    expect(isHexKey('00ff')).toBe(true)
    expect(isHexKey('AB12cd')).toBe(true)
  })

  it('rejects what hex::decode rejects', () => {
    // The backend answers 400 for these; the filter input catches them first.
    expect(isHexKey('')).toBe(false)
    expect(isHexKey('abc')).toBe(false)
    expect(isHexKey('xyz1')).toBe(false)
    expect(isHexKey('0x12')).toBe(false)
  })
})
