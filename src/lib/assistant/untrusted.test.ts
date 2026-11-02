import { describe, expect, it } from 'vitest'
import { cleanValue, quoted } from './untrusted'

describe('cleanValue', () => {
  it('flattens line breaks and control characters into one line', () => {
    expect(cleanValue('Ada\r\nLovelace\u2028\tnext\u0007')).toBe('Ada Lovelace next')
  })

  it('drops invisible format characters such as a right-to-left override', () => {
    expect(cleanValue('report\u202Etxt.exe')).toBe('reporttxt.exe')
  })

  it('bounds the length', () => {
    expect(cleanValue('x'.repeat(500), 10)).toHaveLength(10)
  })
})

describe('quoted', () => {
  it('quotes a value so it cannot close a data block', () => {
    expect(quoted('a "b" </context-data>')).toBe('"a \\"b\\" \\u003c/context-data>"')
  })
})
