import { describe, expect, it } from 'vitest'
import { kindVisible } from './useDatasetSearch'

describe('result section visibility', () => {
  it('hides a silent object section', () => {
    // Under "All" the dataset section carries the one empty answer.
    expect(kindVisible('objects', 'all', 'sample', false)).toBe(false)
    expect(kindVisible('datasets', 'all', 'sample', false)).toBe(true)
  })

  it('keeps an object answer visible', () => {
    // Hits, a failed search and incomplete coverage all count as an answer.
    expect(kindVisible('objects', 'all', 'sample', true)).toBe(true)
  })

  it('always shows the picked kind', () => {
    expect(kindVisible('objects', 'objects', 'sample', false)).toBe(true)
    expect(kindVisible('groups', 'objects', 'sample', false)).toBe(false)
    expect(kindVisible('datasets', 'people', 'sample', false)).toBe(false)
  })

  it('lists only datasets without a query', () => {
    expect(kindVisible('datasets', 'all', '', false)).toBe(true)
    expect(kindVisible('objects', 'objects', '', true)).toBe(false)
  })
})
