import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import * as PlacementPolicies from '@/lib/placementPolicies'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const getBucketPlacement = vi.fn()
const getObjectPlacement = vi.fn()

const column = compileClientComponent(new URL('./PolicyColumn.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slotted('a') },
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
  '@/composables/useAruna': {
    useAruna: () => ({ myGroups: computed(() => [{ id: 'g-1', name: 'Reef survey' }]) }),
  },
  '@/composables/usePlacementPolicies': {
    usePlacementPolicies: () => ({
      getBucketPlacement,
      getObjectPlacement,
      policyName: (policy: { name?: string | null; policy_id: string }) => policy.name ?? policy.policy_id,
    }),
  },
  '@/lib/placementPolicies': PlacementPolicies,
  '@/lib/utils': Utils,
})

const EU_POLICY = { policy_id: 'p-eu', digest: 'a'.repeat(64), name: 'Copies inside the EU', owner_group_id: null }
const GROUP_POLICY = { policy_id: 'p-own', digest: 'b'.repeat(64), name: 'Only our own nodes', owner_group_id: 'g-1' }

async function render(props: Record<string, unknown> = {}) {
  const { root } = await mountApp(column, {
    props: { bucket: 'reef-survey', objectKey: 'raw/reads.fastq', nodeId: null, ...props },
  })
  await flush()
  return content(root)
}

describe('policy column', () => {
  beforeEach(() => {
    getObjectPlacement.mockRejectedValue(new ApiError(404, 'Not found'))
  })

  it('names the policies with the owner the node reported', async () => {
    getBucketPlacement.mockResolvedValue({
      bucket: 'reef-survey',
      generation: 2,
      policies: [EU_POLICY, GROUP_POLICY],
    })

    const text = await render()

    expect(text).toContain('Copies inside the EU')
    expect(text).toContain('Realm')
    expect(text).toContain('Only our own nodes')
    expect(text).toContain('Reef survey')
    expect(text).toContain('A copy has to be allowed by all of them.')
  })

  it('says none rather than leaving the column blank', async () => {
    getBucketPlacement.mockResolvedValue({ bucket: 'reef-survey', generation: 1, policies: [] })

    expect(await render()).toContain('None: copies of this file are not governed.')
  })

  it('drops the owner badge when the node reports no owner', async () => {
    getBucketPlacement.mockResolvedValue({
      bucket: 'reef-survey',
      generation: 1,
      policies: [{ policy_id: 'p-eu', digest: 'a'.repeat(64), name: 'Copies inside the EU' }],
    })

    const text = await render()

    expect(text).toContain('Copies inside the EU')
    expect(text).not.toContain('Realm')
  })

  it('does not answer for a bucket hosted on another node', async () => {
    getBucketPlacement.mockClear()
    getObjectPlacement.mockClear()

    const text = await render({ nodeId: 'node-far' })

    expect(text).toContain('This bucket is hosted on another node.')
    expect(getBucketPlacement).not.toHaveBeenCalled()
    expect(getObjectPlacement).not.toHaveBeenCalled()
  })

  it('prefers the set the file itself carries over the bucket default', async () => {
    getBucketPlacement.mockResolvedValue({ bucket: 'reef-survey', generation: 2, policies: [EU_POLICY] })
    getObjectPlacement.mockResolvedValue({
      bucket: 'reef-survey',
      key: 'raw/reads.fastq',
      version_id: '01J000000000000000000HEAD',
      generation: 7,
      policies: [GROUP_POLICY],
    })

    const text = await render()

    expect(text).toContain('Only our own nodes')
    expect(text).not.toContain('Copies inside the EU')
    expect(text).toContain('This file carries its own rules.')
  })

  it('keeps the note away from a file that follows the bucket default', async () => {
    getBucketPlacement.mockResolvedValue({ bucket: 'reef-survey', generation: 2, policies: [EU_POLICY] })
    getObjectPlacement.mockResolvedValue({
      bucket: 'reef-survey',
      key: 'raw/reads.fastq',
      version_id: '01J000000000000000000HEAD',
      generation: 7,
      policies: [EU_POLICY],
    })

    const text = await render()

    expect(text).toContain('Copies inside the EU')
    expect(text).not.toContain('This file carries its own rules.')
  })
})
