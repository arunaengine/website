import { describe, expect, it } from 'vitest'
import { defaultSettings, grantGap, nodeGlob, planRanges, plannedStart, presetMembers, rangeTotal } from './distributedMock'
import { BAKREP_COUNT, mockBucket, sourceObjects } from './distributedMockData'

describe('distributed mock helpers', () => {
  it('reports the members a node-specific grant does not reach', () => {
    const members = ['node-1', 'node-2', 'node-3']
    expect(grantGap(['node-1', 'node-2'], members)).toEqual(['node-3'])
    expect(grantGap(['*'], members)).toEqual([])
  })

  it('builds the recommended glob from the bucket name', () => {
    expect(nodeGlob('bakrep')).toMatch(/^\/[^/]+\/g\/[^/]+\/data\/\*\/bakrep\/\*\*$/)
  })

  it('puts a replica in another location than its coordinator', () => {
    const ranges = planRanges(4, ['node-1', 'node-2', 'node-3', 'node-5'], true)
    expect(ranges.map((range) => range.coordinator)).toEqual(['node-1', 'node-2', 'node-3', 'node-5'])
    expect(ranges[0].replica).toBe('node-3')
    expect(ranges[2].replica).toBe('node-1')
  })

  it('gives the edge presets a single copy origin and an edge member', () => {
    const [origin, edge] = presetMembers('stream-edge')
    expect(origin.strategy).toBe('copy')
    expect(edge.strategy).toBe('stream')
  })

  it('has one bakrep range per source bucket and about 50 million files', () => {
    const bakrep = mockBucket('bakrep')
    expect(bakrep?.ranges).toHaveLength(BAKREP_COUNT)
    const total = Array.from({ length: BAKREP_COUNT }, (_, index) => sourceObjects(index)).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(49_000_000)
    expect(total).toBeLessThan(51_000_000)
    expect(bakrep?.ranges.filter((range) => range.degradedSince)).toHaveLength(1)
  })

  it('counts ranges from the chosen hint and keeps them within the limit', () => {
    const settings = defaultSettings('sharding')
    expect(rangeTotal(settings)).toBe(8)
    expect(rangeTotal({ ...settings, count: 99_999 })).toBe(4096)
    const keys = { ...settings, hint: 'keys' as const, keys: 'genomes/m\n\ngenomes/t\n' }
    expect(rangeTotal(keys)).toBe(3)
    expect(plannedStart(keys, 2)).toBe('genomes/t')
    expect(rangeTotal({ ...settings, hint: 'import' })).toBe(49)
  })
})
