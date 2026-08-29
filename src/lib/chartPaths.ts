// SVG path builders shared by the portal's small charts: a polyline through
// the points and the area under it down to a baseline. Points are already in
// view-box units.

export interface ChartPoint {
  x: number
  y: number
}

function at(point: ChartPoint): string {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`
}

export function linePath(points: ChartPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${at(point)}`).join(' ')
}

export function areaPath(points: ChartPoint[], baseline: number): string {
  if (!points.length) return ''
  const first = points[0].x.toFixed(2)
  const last = points[points.length - 1].x.toFixed(2)
  const middle = points.map((point) => `L${at(point)}`).join(' ')
  return `M${first} ${baseline} ${middle} L${last} ${baseline} Z`
}

/** Maps a value onto a 0..extent axis, inverted for y so 0 sits at the bottom. */
export function scale(value: number, max: number, extent: number, invert = false): number {
  const ratio = max > 0 ? value / max : 0
  return invert ? extent - ratio * extent : ratio * extent
}
