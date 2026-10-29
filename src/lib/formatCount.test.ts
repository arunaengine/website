import { describe, expect, it } from 'vitest'
import { formatCount } from './formatCount'
import { formatNumber } from './utils'

describe('formatCount', () => {
  it('shows a large count in full with thousands separators, never compact', () => {
    expect(formatCount(3_612_345)).toBe('3,612,345')
    expect(formatCount(12_300)).toBe('12,300')
    expect(formatCount(3_612_345)).toBe(formatNumber(3_612_345))
  })

  it('answers zero for no count or nonsense input', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(Number.NaN)).toBe('0')
  })
})
