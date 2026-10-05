import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import * as StateBadge from '@/lib/stateBadge'
import * as Storage from '@/lib/storage'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'
import type { BlobCopyResponse } from '@/lib/api'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Titled = defineComponent({
  props: { title: String, message: String },
  setup: (props, { slots }) => () => h('div', [props.title ?? props.message ?? '', slots.default?.()]),
})
const DocsLinkStub = defineComponent({
  props: { label: String, section: String, icon: Boolean },
  setup: (props) => () => h('a', { 'data-icon': props.icon }, props.label ?? props.section ?? 'docs'),
})

const getBlobLocations = vi.fn()
const replicateBlob = vi.fn()
const sourceEncrypted = ref<boolean | null>(null)
const realmNodes = ref<Array<{ nodeId: string; label: string; reachable: boolean }>>([])
const SelectStub = defineComponent({
  props: { options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'select',
      (props.options as Array<{ value: string; label: string }>).map((option) =>
        h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label),
      ),
    ),
})
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { attrs, emit }) => () =>
    h('button', { onClick: () => emit('update:checked', !props.checked) }, String(attrs['aria-label'] ?? '')),
})

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
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://a.test/api/v1'), getBlobLocations, replicateBlob }),
  },
  '@/composables/useEncryptedSource': { useEncryptedSource: () => sourceEncrypted },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ displayName: (id: string) => `Node ${id}`, nodes: realmNodes }),
  },
  '@/lib/api': Api,
  '@/lib/bucketEncryption': Wording,
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

async function mount(copies: BlobCopyResponse[], complete = true) {
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
  return root
}

async function render(copies: BlobCopyResponse[], complete = true) {
  return content(await mount(copies, complete))
}

beforeEach(() => {
  realmNodes.value = []
  sourceEncrypted.value = null
  replicateBlob.mockReset()
})

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
    expect(text).toContain('Storage locations')
    expect(text).not.toContain('Learn about')
  })

  it('offers an unencrypted copy only for an encrypted bucket and sends it when chosen', async () => {
    realmNodes.value = [{ nodeId: 'node-b', label: 'Node B', reachable: true }]
    replicateBlob.mockResolvedValue({})
    expect(await render([copy()])).not.toContain('Store the copy unencrypted')

    sourceEncrypted.value = true
    const root = await mount([copy()])
    await click(button(root, 'Node B'))
    await click(button(root, 'Store the copy unencrypted'))
    expect(content(root)).toContain('The copy is stored unencrypted on that node.')
    await click(button(root, 'Replicate'))

    expect(replicateBlob).toHaveBeenCalledWith({
      bucket: 'reef-survey',
      path: 'raw/reads.fastq',
      version_id: '01J0000000000000000000VERS',
      node_id: 'node-b',
      plaintext: true,
    })
  })

  it('explains why a copy of an encrypted bucket was refused', async () => {
    realmNodes.value = [{ nodeId: 'node-b', label: 'Node B', reachable: true }]
    sourceEncrypted.value = true
    const root = await mount([copy()])
    const refusals: Array<[string | undefined, string]> = [
      ['plaintext_required', 'The source bucket is encrypted and the target bucket is not'],
      ['not_holder', 'Only key holders of the source bucket may store a copy unencrypted.'],
      [undefined, 'Adding a copy needs WRITE permission on this file.'],
    ]
    for (const [code, message] of refusals) {
      replicateBlob.mockRejectedValueOnce(new Api.ApiError(403, 'forbidden', code))
      await click(button(root, 'Node B'))
      await click(button(root, 'Replicate'))
      expect(content(root)).toContain(message)
    }
    expect(replicateBlob.mock.calls[0][0]).not.toHaveProperty('plaintext')
  })
})
