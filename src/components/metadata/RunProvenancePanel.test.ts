import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import * as DataIdentity from '@/lib/crate/dataIdentity'
import * as Identifiers from '@/lib/identifiers'
import * as StateBadge from '@/lib/stateBadge'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'

const Slot = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()),
})

const RunProvenancePanel = compileClientComponent(new URL('./RunProvenancePanel.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/ExternalLink.vue': moduleDefault(Slot),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/lib/stateBadge': StateBadge,
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('https://api.test') }) },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({ resolveUsers: vi.fn(), cachedUser: () => null }),
  },
  '@/composables/useS3': { useS3: () => ({ endpoint: ref('https://s3.test') }) },
  '@/lib/config': { featureEnabled: () => false },
  '@/lib/tes': Tes,
  '@/lib/crate/dataIdentity': DataIdentity,
  '@/lib/identifiers': Identifiers,
  '@/lib/utils': Utils,
  '@lucide/vue': new Proxy({}, { get: () => Slot }),
})

const CONTENT = `https://w3id.org/aruna/data/${'d'.repeat(64)}`

async function linkOf(output: { id: string; contentUrl?: string }) {
  const run = { inputs: [], outputs: [{ name: 'out.csv', ...output }] }
  const mounted = await mountApp(RunProvenancePanel, { props: { run } })
  const anchor = nodes(mounted.root).find((node) => node.tag === 'a')
  mounted.app.unmount()
  return anchor?.props ?? null
}

describe('RunProvenancePanel', () => {
  it('opens a versioned ARN output in the bucket browser', async () => {
    const id = 'https://w3id.org/aruna/data/arn:aruna:r1:n1:s3/results/runs/out.csv@01V'
    expect((await linkOf({ id, contentUrl: CONTENT }))?.to).toEqual({
      name: 'bucket',
      params: { bucketId: 'results' },
      query: { prefix: 'runs' },
    })
  })

  it('opens a current form output in the bucket browser', async () => {
    expect((await linkOf({ id: CONTENT, contentUrl: 's3://results/runs/out.csv' }))?.to).toEqual({
      name: 'bucket',
      params: { bucketId: 'results' },
      query: { prefix: 'runs' },
    })
  })

  it('resolves a bare content address through DRS', async () => {
    expect((await linkOf({ id: CONTENT }))?.href).toBe(Tes.drsObjectHref('https://api.test', CONTENT))
  })
})
