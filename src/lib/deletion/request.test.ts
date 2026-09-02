import { describe, expect, it } from 'vitest'
import {
  requestLabel,
  requestNoun,
  requestScope,
  selectionIds,
  type DeleteRequest,
} from './request'

function selection(keys: string[], prefixes: string[]): DeleteRequest {
  return { kind: 'selection', bucket: 'reef', nodeId: null, keys, prefixes }
}

describe('delete request labels', () => {
  it('names both halves of a mixed selection', () => {
    const request = selection(['a.txt', 'b.txt'], ['raw/'])

    expect(requestNoun(request)).toBe('2 files and 1 folder')
    expect(requestLabel(request)).toBe('2 files and 1 folder')
  })

  it('leaves out the half that is empty', () => {
    expect(requestNoun(selection(['a.txt'], []))).toBe('1 file')
    expect(requestNoun(selection([], ['raw/', 'cooked/']))).toBe('2 folders')
    expect(requestNoun(selection([], []))).toBe('0 files')
  })

  it('lists the objects before the folders', () => {
    expect(selectionIds(selection(['a.txt'], ['raw/']))).toEqual(['a.txt', 'raw/'])
    expect(selectionIds({ kind: 'object', bucket: 'reef', nodeId: null, key: 'a.txt' })).toEqual([])
  })

  it('keeps a selection out of the single-scope preflight', () => {
    // A selection has no one REST scope: each entry carries its own.
    expect(requestScope(selection(['a.txt'], ['raw/']))).toBeNull()
  })
})
