import { describe, expect, it } from 'vitest'
import { formatResourceGb } from './utils'

describe('formatResourceGb', () => {
  it('names a whole number of GiB in GiB', () => {
    expect(formatResourceGb(2.147483648)).toBe('2 GiB')
  })

  it('names a whole number of GB in GB', () => {
    expect(formatResourceGb(500)).toBe('500 GB')
  })

  it('rounds anything else to one decimal in GB', () => {
    expect(formatResourceGb(1.5)).toBe('1.5 GB')
    expect(formatResourceGb(0.75)).toBe('0.8 GB')
  })
})
