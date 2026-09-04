import { describe, expect, it } from 'vitest'
import { lineDiff } from './lineDiff'

describe('lineDiff', () => {
  it('keeps the shared lines and marks what each side has alone', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'remove', text: 'b' },
      { op: 'add', text: 'x' },
      { op: 'same', text: 'c' },
    ])
  })

  it('marks every line when one side is empty', () => {
    expect(lineDiff('', 'a\nb')).toEqual([
      { op: 'remove', text: '' },
      { op: 'add', text: 'a' },
      { op: 'add', text: 'b' },
    ])
  })

  it('reports no change for two identical texts', () => {
    expect(lineDiff('a\nb', 'a\nb').every((line) => line.op === 'same')).toBe(true)
  })
})
