import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as PlacementPolicies from '@/lib/placementPolicies'
import type { CoverageResponse } from '@/lib/placementPolicies'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

const getPlacementCoverage = vi.fn()
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const Labelled = defineComponent({
  props: { label: String, value: String },
  setup: (props) => () => h('div', `${props.label} ${props.value}`),
})

const Section = compileClientComponent(new URL('./BucketComplianceSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(Slot),
  '@/components/ui/DocsLink.vue': moduleDefault(Slot),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Slot),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/RefusalNote.vue': moduleDefault(Slot),
  '@/components/ui/Skeleton.vue': moduleDefault(Slot),
  '@/components/ui/Spinner.vue': moduleDefault(Slot),
  '@/components/ui/StatCard.vue': moduleDefault(Labelled),
  '@/components/placement/CoverageReport.vue': moduleDefault(Slot),
  '@/composables/usePlacementPolicies': {
    usePlacementPolicies: () => ({ getPlacementCoverage, runBucketPlacement: vi.fn() }),
  },
  '@/lib/api': Api,
  '@/lib/placementPolicies': PlacementPolicies,
  '@/lib/utils': Utils,
})

function report(extra: Partial<CoverageResponse> = {}): CoverageResponse {
  return {
    bucket: 'bakrep', scope: 'current', generation: 2, target_policies: [], observed: 18, deleted: 0, gaps: [],
    registered: 18, quarantined: 0, absent: 0, reference_only: 0, complete: true,
    limits: ['responder_local', 'historical_excluded'], ...extra,
  }
}

async function text(nodeId: string | null = null) {
  const mounted = await mountApp(
    defineComponent(() => () => h(Section, { bucket: 'bakrep', canApply: true, blockedReason: null, nodeId })),
  )
  await flush()
  return content(mounted.root)
}

describe('bucket compliance section', () => {
  it('says the counts are this node\'s for a bucket on one node', async () => {
    getPlacementCoverage.mockResolvedValue(report())
    const shown = await text()
    expect(shown).toContain('Coverage on this node')
    expect(shown).toContain('Objects this node listed 18')
  })

  it('shows the joined coverage of a bucket on several nodes and names a node that did not report', async () => {
    getPlacementCoverage.mockResolvedValue(
      report({ limits: ['historical_excluded', 'bounded_page'], complete: false, cursor: 'c1', unreached: ['node-3'] }),
    )
    const shown = await text('node-2')
    expect(getPlacementCoverage).toHaveBeenLastCalledWith('bakrep', expect.anything(), 'node-2')
    expect(shown).toContain('Coverage of the bucket')
    expect(shown).toContain('Objects listed 18')
    expect(shown).toContain('A node that writes part of this bucket did not report')
  })
})
