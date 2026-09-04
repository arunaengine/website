// Geometry for the landing page's node graphs: where a straight link between
// two node cards starts and ends, measured from the graph's own box, so the
// same numbers drive the SVG line and the path a packet travels along.

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

export interface Point {
  x: number
  y: number
}

export interface Segment {
  from: Point
  to: Point
}

/** A node's box in the graph's coordinate space. */
export function boxIn(node: Rect, root: Rect): Box {
  const x = node.left - root.left
  const y = node.top - root.top
  return { x, y, w: node.width, h: node.height, cx: x + node.width / 2, cy: y + node.height / 2 }
}

/** Where a line toward (tx, ty) leaves the box, a small gap outside its edge. */
export function edgePoint(box: Box, tx: number, ty: number, gap = 8): Point {
  const dx = tx - box.cx
  const dy = ty - box.cy
  if (!dx && !dy) return { x: box.cx, y: box.cy }
  const sx = dx ? (box.w / 2 + gap) / Math.abs(dx) : Number.POSITIVE_INFINITY
  const sy = dy ? (box.h / 2 + gap) / Math.abs(dy) : Number.POSITIVE_INFINITY
  const s = Math.min(sx, sy)
  return { x: box.cx + dx * s, y: box.cy + dy * s }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** The link between two boxes, edge to edge. */
export function segment(a: Box, b: Box, gap = 8): Segment {
  const from = edgePoint(a, b.cx, b.cy, gap)
  const to = edgePoint(b, a.cx, a.cy, gap)
  return {
    from: { x: round(from.x), y: round(from.y) },
    to: { x: round(to.x), y: round(to.y) },
  }
}

/** The CSS `offset-path` a packet follows along the link. */
export function linkPath(link: Segment): string {
  return `path("M ${link.from.x} ${link.from.y} L ${link.to.x} ${link.to.y}")`
}
