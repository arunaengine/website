import { describe, expect, it } from 'vitest'
import { pickerFor } from './pickers'

describe('pickerFor', () => {
  it('sends every parts list to the data picker', () => {
    expect(pickerFor('hasPart')).toBe('data')
    expect(pickerFor('http://schema.org/hasPart')).toBe('data')
  })

  it('leaves every other property with the range-driven default', () => {
    expect(pickerFor('author')).toBe('reference')
    expect(pickerFor('license')).toBe('reference')
    expect(pickerFor('somethingInvented')).toBe('reference')
  })
})
