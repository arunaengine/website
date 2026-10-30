import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatResourceGb } from './utils'

describe('formatDateTime', () => {
  it('reads day, short month, year and a 24 hour clock without seconds', () => {
    expect(formatDateTime(new Date(2026, 9, 29, 13, 38, 19))).toBe('29 Oct 2026, 13:38')
    expect(formatDateTime(new Date(2026, 8, 3, 7, 5))).toBe('3 Sep 2026, 07:05')
  })

  it('keeps a UTC date on its calendar day and leaves an unreadable value empty', () => {
    expect(formatDate('2026-10-29', true)).toBe('29 Oct 2026')
    expect(formatDateTime('not a date')).toBe('')
  })
})

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
