import { describe, expect, it } from 'vitest'
import { boxIn, edgePoint, linkPath, segment } from './graphLinks'

const root = { left: 100, top: 50, width: 800, height: 400 }

describe('graph links', () => {
  it('measures a node inside the graph', () => {
    const box = boxIn({ left: 140, top: 70, width: 200, height: 80 }, root)

    expect(box).toEqual({ x: 40, y: 20, w: 200, h: 80, cx: 140, cy: 60 })
  })

  it('leaves a box through the side that faces the target, a gap outside it', () => {
    const box = { x: 0, y: 0, w: 200, h: 100, cx: 100, cy: 50 }

    expect(edgePoint(box, 500, 50)).toEqual({ x: 208, y: 50 })
    expect(edgePoint(box, 100, 400)).toEqual({ x: 100, y: 108 })
    expect(edgePoint(box, 100, 50)).toEqual({ x: 100, y: 50 })
  })

  it('joins two boxes edge to edge and writes the packet path', () => {
    const a = { x: 0, y: 0, w: 200, h: 100, cx: 100, cy: 50 }
    const b = { x: 400, y: 0, w: 200, h: 100, cx: 500, cy: 50 }
    const link = segment(a, b)

    expect(link).toEqual({ from: { x: 208, y: 50 }, to: { x: 392, y: 50 } })
    expect(linkPath(link)).toBe('path("M 208 50 L 392 50")')
  })
})
