// Placement read-model helpers over GET /info/realm data (aruna#269).
// The backend substitutes the effective location server-side (empty ⇒
// "default", see api/src/routes/info.rs), so placement.location is never
// empty on the wire. Nodes without a placement entry are NOT in the realm's
// placement map and are aggregated into a separate honest bucket.
import type { PlacementAffinityRule, RealmNodeInfo } from './api'

export const UNMAPPED = '(not in placement map)'

export interface LocationAggregate {
  location: string // "default" | real location | UNMAPPED
  mapped: boolean // false only for the UNMAPPED bucket
  nodeCount: number
  connectedCount: number
  fullCount: number
  drainingCount: number
  totalWeight: number // sum of placement weights (mapped nodes only)
  // Utilization sums cover only nodes that published an info document.
  reportingCount: number
  storageBytesUsed: number
  documentsHeld: number
}

// Buckets nodes by their effective placement location. Mapped buckets sort by
// node count (desc) then name; the UNMAPPED bucket is always last and omitted
// entirely when empty, so the panel never fabricates a bucket for a realm whose
// nodes are all mapped.
export function aggregateByLocation(nodes: RealmNodeInfo[]): LocationAggregate[] {
  const buckets = new Map<string, LocationAggregate>()
  for (const node of nodes) {
    const mapped = Boolean(node.placement)
    const location = node.placement?.location ?? UNMAPPED
    let bucket = buckets.get(location)
    if (!bucket) {
      bucket = {
        location,
        mapped,
        nodeCount: 0,
        connectedCount: 0,
        fullCount: 0,
        drainingCount: 0,
        totalWeight: 0,
        reportingCount: 0,
        storageBytesUsed: 0,
        documentsHeld: 0,
      }
      buckets.set(location, bucket)
    }
    bucket.nodeCount += 1
    if (node.connection_status === 'connected') bucket.connectedCount += 1
    if (node.placement) {
      if (node.placement.full) bucket.fullCount += 1
      if (node.placement.draining) bucket.drainingCount += 1
      bucket.totalWeight += node.placement.weight
    }
    if (node.info) {
      bucket.reportingCount += 1
      bucket.storageBytesUsed += node.info.utilization.storage_bytes_used
      bucket.documentsHeld += node.info.utilization.documents_held
    }
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.mapped !== b.mapped) return a.mapped ? -1 : 1 // UNMAPPED last
    return b.nodeCount - a.nodeCount || a.location.localeCompare(b.location)
  })
}

// Unique placement locations, sorted, mapped nodes only — the realm's "known
// locations" list that feeds the affinity pin chips (issue #269).
export function knownLocations(nodes: RealmNodeInfo[]): string[] {
  const locations = new Set<string>()
  for (const node of nodes) {
    if (node.placement) locations.add(node.placement.location)
  }
  return [...locations].sort((a, b) => a.localeCompare(b))
}

// Assumed reserved matcher key for location pinning (aruna#269): affinity
// matches label key/value pairs, and core's built-in matcher keys use the
// 'aruna.io/' prefix (the core tests match 'aruna.io/kind'). Until the backend
// fixes the vocabulary, location pins are emitted as
// { key: LOCATION_AFFINITY_KEY, value: <location>, effect: 'filter' }.
export const LOCATION_AFFINITY_KEY = 'aruna.io/location'

export function isLocationPin(rule: PlacementAffinityRule): boolean {
  return rule.key === LOCATION_AFFINITY_KEY && rule.effect.kind === 'filter'
}

// The locations currently pinned by the strategy's affinity filter rules.
export function locationPins(affinity: PlacementAffinityRule[]): string[] {
  return affinity.filter(isLocationPin).map((rule) => rule.value)
}

// Replaces all location-filter rules with the given pins; every other rule is
// preserved verbatim so the editor never destroys config it can't render.
export function setLocationPins(
  affinity: PlacementAffinityRule[],
  locations: string[],
): PlacementAffinityRule[] {
  const preserved = affinity.filter((rule) => !isLocationPin(rule))
  const pins: PlacementAffinityRule[] = locations.map((location) => ({
    key: LOCATION_AFFINITY_KEY,
    value: location,
    effect: { kind: 'filter' },
  }))
  return [...preserved, ...pins]
}
