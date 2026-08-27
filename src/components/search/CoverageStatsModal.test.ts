import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import * as Utils from '@/lib/utils'
import { click, compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'
import type { ObjectSearchCoverage } from '@/lib/api'

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const dialogStubs = Object.fromEntries(
  ['Dialog', 'DialogClose', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle'].map(
    (name) => [`@/components/ui/${name}.vue`, moduleDefault(Passthrough)],
  ),
)

const CoverageStatsModal = compileClientComponent(new URL('./CoverageStatsModal.vue', import.meta.url), {
  vue: VueRuntime,
  ...dialogStubs,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/composables/useUnifiedSearch': {
    OBJECT_SEARCH_MODE_LABELS: {
      local: 'Local',
      distributed_best_effort: 'Distributed best-effort',
      distributed_strict: 'Distributed strict',
    },
  },
  '@/lib/utils': Utils,
})

const CoverageIcon = compileClientComponent(new URL('./CoverageIcon.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
})

const complete: ObjectSearchCoverage = {
  scope: 'realm',
  mode: 'distributed_best_effort',
  index_freshness: { source: 'live_heads', as_of: '2026-08-19T09:00:00Z' },
  nodes_queried: 3,
  nodes_failed: 0,
  failed_partitions: [],
  omitted_partitions: 0,
  complete: true,
  truncated: false,
  partitions: [],
}

const degraded: ObjectSearchCoverage = {
  ...complete,
  index_freshness: { ...complete.index_freshness, oldest_observed_at: '2026-08-18T09:00:00Z' },
  nodes_failed: 1,
  failed_partitions: ['node-c'],
  omitted_partitions: 2,
  complete: false,
  truncated: true,
}

describe('query coverage modal', () => {
  it('reports every queried node and the measured request time', async () => {
    const mounted = await mountApp(CoverageStatsModal, {
      props: { open: true, coverage: complete, requestMs: 42 },
    })
    const html = content(mounted.root)

    expect(html).toContain('Query coverage')
    expect(html).toContain('Every node answered')
    expect(html).toContain('Nodes queried')
    expect(html).toContain('Nodes failed')
    expect(html).toContain('Freshness source')
    expect(html).toContain('live heads')
    expect(html).toContain('Distributed best-effort')
    expect(html).toContain('Realm')
    expect(html).toContain('Request time (measured in app)')
    expect(html).toContain('42 ms')
    expect(html).toContain('Close')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('names the partitions that failed and the truncation', async () => {
    const mounted = await mountApp(CoverageStatsModal, {
      props: { open: true, coverage: degraded, requestMs: 7 },
    })
    const html = content(mounted.root)

    expect(html).toContain('node-c')
    expect(html).toContain('Yes, load more for the full set')
    expect(html).toContain('Omitted partitions')
    expect(html).toContain('Oldest observed partition')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('keeps the timing when the search returned no coverage at all', async () => {
    const mounted = await mountApp(CoverageStatsModal, {
      props: { open: true, coverage: null, requestMs: 12, error: 'Strict coverage unavailable' },
    })
    const html = content(mounted.root)

    expect(html).toContain('Strict coverage unavailable')
    expect(html).toContain('Request time (measured in app)')
    expect(html).toContain('12 ms')
    expect(html).not.toContain('Nodes queried')
    mounted.app.unmount()
  })
})

describe('coverage icon', () => {
  it('carries the answer in its label and prints no status word', async () => {
    const mounted = await mountApp(CoverageIcon, { props: { complete: true } })

    expect(content(mounted.root).trim()).toBe('')
    expect(element(mounted.root, (node) => node.props['aria-label'] === 'Search coverage: complete')).toBeDefined()
    mounted.app.unmount()
  })

  it('warns when the answer is not complete and stays clickable', async () => {
    let opened = 0
    const mounted = await mountApp(CoverageIcon, {
      props: { complete: false, onClick: () => (opened += 1) },
    })

    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Search coverage: partial'))
    expect(opened).toBe(1)
    expect(content(mounted.root).trim()).toBe('')
    mounted.app.unmount()
  })
})
