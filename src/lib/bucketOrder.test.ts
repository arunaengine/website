import { describe, expect, it } from 'vitest'
import { ORDER_VALUE_BYTES, encodeOrder, moveBucket, orderCompare, parseOrder } from './bucketOrder'

describe('bucket order', () => {
  it('reads the names once each, without blanks', () => {
    expect(parseOrder(' reef, ,genes,reef ')).toEqual(['reef', 'genes'])
    expect(parseOrder(undefined)).toEqual([])
  })

  it('keeps only the names that fit one attribute value', () => {
    const names = Array.from({ length: 400 }, (_, index) => `bucket-${String(index).padStart(4, '0')}`)
    const value = encodeOrder(names)
    expect(value.length).toBeLessThanOrEqual(ORDER_VALUE_BYTES)
    expect(parseOrder(value)).toEqual(names.slice(0, parseOrder(value).length))
    expect(parseOrder(value).length).toBeLessThan(names.length)
  })

  it('puts names that are not in the order last, as equals', () => {
    const compare = orderCompare(['gamma', 'alpha'])
    expect(['alpha', 'beta', 'gamma', 'delta'].sort(compare)).toEqual(['gamma', 'alpha', 'beta', 'delta'])
    expect(compare('beta', 'delta')).toBe(0)
  })

  it('moves a name to the place of the target, up or down', () => {
    expect(moveBucket([], ['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveBucket([], ['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('keeps saved names that are not shown and adds the shown ones after them', () => {
    expect(moveBucket(['x', 'b'], ['b', 'a', 'c'], 'c', 'a')).toEqual(['x', 'b', 'c', 'a'])
  })
})
