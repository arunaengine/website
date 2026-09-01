import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useRefresh } from '@/composables/useRefresh'
import * as Api from '@/lib/api'
import * as PlacementPolicies from '@/lib/placementPolicies'
import * as Utils from '@/lib/utils'
import {
  compileClientComponent,
  content,
  element,
  mountApp,
  moduleDefault,
} from '@/test/clientRender'
import type { CoverageResponse, PolicyResponse } from '@/lib/placementPolicies'

const digestOne = 'a'.repeat(64)
const digestTwo = 'b'.repeat(64)

function policy(id: string, digest: string, name: string): PolicyResponse {
  return { policy_id: id, digest, name, allowed: [], publisher: 'realm', created_by: 'admin', created_at_ms: 0 }
}

const coverage: CoverageResponse = {
  bucket: 'reef-survey',
  scope: 'current',
  generation: 3,
  target_policies: [],
  observed: 10,
  deleted: 0,
  gaps: [{ key: 'raw/one.fastq', version_id: '01J', attachment: 'missing' }],
  registered: 9,
  quarantined: 0,
  absent: 1,
  reference_only: 0,
  complete: true,
  limits: [],
}

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { slots }) => () => h(tag, slots.default?.()) })
const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const SelectStub = defineComponent({
  props: { options: { type: Array, default: () => [] }, modelValue: String },
  setup: (props) => () => h('select', { options: props.options }),
})
const TextStub = (tag: string) =>
  defineComponent({
    props: { title: String, description: String, label: String, value: String },
    setup: (props, { slots }) => () => h(tag, [props.title ?? '', props.label ?? '', slots.default?.()]),
  })

const placementApi = {
  getBucketPlacement: vi.fn(),
  getPlacementCoverage: vi.fn(),
  putBucketPlacement: vi.fn(),
  runBucketPlacement: vi.fn(),
  loadPolicyPage: vi.fn(),
  listState: ref('ready'),
  listedPolicies: ref<PolicyResponse[]>([]),
  sessionPolicies: ref<PolicyResponse[]>([]),
  sessionPolicyRefs: ref([]),
}

const section = compileClientComponent(new URL('./BucketPlacementSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/placement/CoverageReport.vue': moduleDefault(Slotted('article')),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/EmptyState.vue': moduleDefault(TextStub('div')),
  '@/components/ui/ErrorPanel.vue': moduleDefault(TextStub('div')),
  '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/StatCard.vue': moduleDefault(TextStub('div')),
  '@/composables/usePlacementPolicies': { usePlacementPolicies: () => placementApi },
  '@/composables/useRefresh': { useRefresh },
  '@/lib/api': Api,
  '@/lib/placementPolicies': PlacementPolicies,
  '@/lib/utils': Utils,
})

async function render() {
  placementApi.getBucketPlacement.mockResolvedValue({
    bucket: 'reef-survey',
    policies: [{ policy_id: 'p-eu', digest: digestOne }],
    generation: 3,
  })
  placementApi.getPlacementCoverage.mockResolvedValue(coverage)
  placementApi.listedPolicies.value = [
    policy('p-eu', digestOne, 'Two copies in the EU'),
    policy('p-inst', digestTwo, 'A copy at institute X'),
  ]
  const { root } = await mountApp(section, { props: { open: true, bucket: 'reef-survey' } })
  return root
}

describe('bucket placement section', () => {
  it('summarises the attached policies by name', async () => {
    const text = content(await render())

    expect(text).toContain('Two copies in the EU')
    expect(text).not.toContain(digestOne)
    expect(text).toContain('9 of 10 objects')
  })

  it('offers the unattached realm policies for attaching', async () => {
    const options = element(await render(), (node) => node.tag === 'select').props.options

    expect(options).toEqual([{ value: `p-inst:${digestTwo}`, label: 'A copy at institute X' }])
  })
})
