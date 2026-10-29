import { describe, expect, it } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'
import { groupByPlace, hasCoordinates } from './nodePlaces'

const node = (node_id: string, coordinates?: { lat: number; lon: number } | null) =>
  ({ node_id, kind: 'server', configured: true, present: true, connection_status: 'connected', coordinates }) as RealmNodeInfo

describe('nodes on a map', () => {
  it('needs coordinates on at least one node', () => {
    expect(hasCoordinates([node('a'), node('b', null)])).toBe(false)
    expect(hasCoordinates([node('a'), node('b', { lat: 50.58, lon: 8.67 })])).toBe(true)
  })

  it('puts nodes of one site on one marker and leaves out nodes without a place', () => {
    const places = groupByPlace([
      node('giessen-1', { lat: 50.5841, lon: 8.6784 }),
      node('giessen-2', { lat: 50.5843, lon: 8.6781 }),
      node('marburg', { lat: 50.8019, lon: 8.7658 }),
      node('nowhere'),
    ])
    expect(places.map((place) => place.nodes.map((entry) => entry.node_id))).toEqual([['giessen-1', 'giessen-2'], ['marburg']])
  })
})
