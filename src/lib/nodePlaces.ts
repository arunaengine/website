// Nodes on a map: those that share a place (coordinates equal to about 100 m) form one marker, so a
// site with many nodes stays one dot with its count instead of a pile.
import type { RealmNodeInfo } from '@/lib/api'

export interface NodePlace {
  key: string
  lat: number
  lon: number
  nodes: RealmNodeInfo[]
}

/** The OpenStreetMap raster tiles; the portal must be allowed to connect to this origin. */
export const OSM_TILE_ORIGIN = 'https://tile.openstreetmap.org'
export const OSM_TILE_URL = `${OSM_TILE_ORIGIN}/{z}/{x}/{y}.png`
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** Whether any node can stand on a map. */
export function hasCoordinates(nodes: readonly RealmNodeInfo[]): boolean {
  return nodes.some((node) => node.coordinates != null)
}

export function groupByPlace(nodes: readonly RealmNodeInfo[]): NodePlace[] {
  const places = new Map<string, NodePlace>()
  for (const node of nodes) {
    const at = node.coordinates
    if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lon)) continue
    const key = `${at.lat.toFixed(3)},${at.lon.toFixed(3)}`
    const place = places.get(key)
    if (place) place.nodes.push(node)
    else places.set(key, { key, lat: at.lat, lon: at.lon, nodes: [node] })
  }
  return [...places.values()]
}
