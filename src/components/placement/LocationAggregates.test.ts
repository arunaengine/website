import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import LocationAggregates from './LocationAggregates.vue'
import type { LocationAggregate } from '@/lib/placement'

const base: LocationAggregate = {
  location: 'Giessen',
  mapped: true,
  nodeCount: 3,
  connectedCount: 3,
  fullCount: 0,
  drainingCount: 0,
  totalWeight: 300,
  reportingCount: 3,
  storageBytesUsed: 2048,
  documentsHeld: 12,
}

const render = (aggregate: LocationAggregate) =>
  renderToString(createSSRApp({ render: () => h(LocationAggregates, { aggregates: [aggregate] }) }))

describe('location totals', () => {
  it('reads partial sums as a lower bound with the reporting share', async () => {
    const html = await render({ ...base, reportingCount: 1 })
    expect(html).toContain('at least 2\u00a0KB stored')
    expect(html).toContain('1/3 reporting')
  })

  it('reads full sums plainly and says when no node reported', async () => {
    const full = await render(base)
    expect(full).not.toContain('at least')
    expect(full).not.toContain('reporting')
    expect(await render({ ...base, reportingCount: 0 })).toContain('No usage reported')
  })
})
