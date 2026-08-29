import { describe, expect, it } from 'vitest'
import { areaPath, linePath, scale } from './chartPaths'

describe('chart paths', () => {
  it('draws a polyline through the points', () => {
    expect(linePath([{ x: 0, y: 40 }, { x: 50, y: 20 }, { x: 100, y: 0 }])).toBe('M0.00 40.00 L50.00 20.00 L100.00 0.00')
  })

  it('closes the area down to the baseline', () => {
    expect(areaPath([{ x: 0, y: 30 }, { x: 100, y: 10 }], 40)).toBe('M0.00 40 L0.00 30.00 L100.00 10.00 L100.00 40 Z')
    expect(areaPath([], 40)).toBe('')
  })

  it('scales a value onto the axis, inverted for y', () => {
    expect(scale(50, 100, 40)).toBe(20)
    expect(scale(50, 100, 40, true)).toBe(20)
    expect(scale(100, 100, 40, true)).toBe(0)
    expect(scale(5, 0, 40)).toBe(0)
  })
})
