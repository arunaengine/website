import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as StateBadge from '@/lib/stateBadge'
import * as Storage from '@/lib/storage'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'
import type { BlobCopyResponse } from '@/lib/api'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Titled = defineComponent({
  props: { title: String, message: String },
  setup: (props, { slots }) => () => h('div', [props.title ?? props.message ?? '', slots.default?.()]),
})
const DocsLinkStub = defineComponent({
  props: { label: String, section: String },
  setup: (props) => () => h('a', props.label ?? props.section ?? 'docs'),
})

const getBlobLocations = vi.fn()

const panel = compileClientComponent(new URL('./ObjectLocationsPanel.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slotted('a') },
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DocsLink.vue': moduleDefault(DocsLinkStub),
  '@/components/ui/EmptyState.vue': moduleDefault(Titled),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Titled),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
  '@/components/ui/RefusalNote.vue': moduleDefault(Titled),
  '@/components/ui/Select.vue': moduleDefault(Slotted('select')),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
  '@/composables/useAruna': { useAruna: () => ({ getBlobLocations, replicateBlob: vi.fn() }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ displayName: (id: string) => `Node ${id}`, nodes: ref([]) }),
  },
  '@/lib/api': Api,
  '@/lib/stateBadge': StateBadge,
  '@/lib/storage': Storage,
  '@/lib/utils': Utils,
})

function copy(overrides: Partial<BlobCopyResponse> = {}): BlobCopyResponse {
  return {
    node_id: 'node-a',
    local: true,
    bucket: 'reef-survey',
    key: 'raw/reads.fastq',
    state: 'present',
    storage: 'node-managed',
    ...overrides,
  }
}

async function render(copies: BlobCopyResponse[], complete = true) {
  getBlobLocations.mockResolvedValue({
    bucket: 'reef-survey',
    key: 'raw/reads.fastq',
    version_id: '01J0000000000000000000VERS',
    copies,
    complete,
    limits: complete ? [] : ['holder-unreachable'],
  })
  const { root } = await mountApp(panel, {
    props: {
      active: true,
      bucket: 'reef-survey',
      objectKey: 'raw/reads.fastq',
      versionId: null,
      nodeId: null,
      groupId: 'g-1',
    },
  })
  await flush()
  return content(root)
}

describe('object locations panel', () => {
  it('says why each copy is where it is', async () => {
    const text = await render([
      copy({ origin: 'write' }),
      copy({
        node_id: 'node-b',
        local: false,
        bucket: 'mirror',
        key: 'reads.fastq',
        origin: 'sync',
        sync_relationship_id: 'rel-1',
      }),
      copy({ node_id: 'node-c', local: false, origin: 'staging' }),
    ])

    expect(text).toContain('this node, storage backend')
    expect(text).toContain('via sync into mirror/reads.fastq')
    expect(text).toContain('Open the syncs of this bucket')
    expect(text).toContain('staged for a run')
  })

  it('adds no explanation for an origin the node did not report', async () => {
    const text = await render([copy(), copy({ node_id: 'node-b', local: false, origin: 'unknown' })])

    expect(text).toContain('Node node-a')
    expect(text).not.toContain('written here')
    expect(text).not.toContain('via sync')
  })

  it('marks a copy its node holds back and stays quiet for an allowed one', async () => {
    const held = await render([copy({ compliance: 'quarantined' })])
    expect(held).toContain('Held back: no longer matches its rules')

    const allowed = await render([copy({ compliance: 'allowed' })])
    expect(allowed).not.toContain('Held back')
  })

  it('says a bounded list may be incomplete in one sentence', async () => {
    const text = await render([copy()], false)

    expect(text).toContain('This list may be incomplete')
    expect(text).toContain('Learn about storage locations')
  })
})
