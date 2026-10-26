import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as MockData from '@/lib/distributedMockData'
import * as Distribution from '@/lib/distribution'
import * as Preflight from '@/composables/useSetPreflight'
import { button, compileClientComponent, content, element, mountApp, moduleDefault, typeValue } from '@/test/clientRender'

const lookup = {
  preflight: ref<unknown>(null),
  loading: ref(false),
  error: ref<string | null>(null),
  reload: vi.fn(),
}
const remove = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('input', { 'data-name': true, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})
const LinkStub = defineComponent({ props: { to: Object }, setup: (_, { slots }) => () => h('a', slots.default?.()) })

const component = compileClientComponent(new URL('./SetDeleteDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(defineComponent({ props: { lines: Array }, setup: (props, { slots }) => () => h('aside', [slots.default?.(), ...(props.lines ?? []).map((line) => h('p', String(line)))]) })),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('i')),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
  '@/composables/useSetChanges': { useSetChanges: () => ({ busy: ref(false), failure: ref(null), remove }) },
  '@/composables/useSetPreflight': { coverageNotes: Preflight.coverageNotes, excludedNotes: Preflight.excludedNotes, useSetPreflight: () => lookup },
  '@/lib/distributedMockData': MockData,
  '@/lib/distribution': Distribution,
})

const bucket: Distribution.DistributedBucket = {
  name: 'spire',
  preset: 'mirror',
  members: [],
  ranges: [],
  live: {
    setId: 's1', groupId: 'g1', pending: false, serving: true, conflicted: false, changesUnavailable: false,
    recommendedGrant: '', transfers: [], deletion: null, publicationsClosed: false,
  },
}

function answer(coverage: Record<string, unknown>) {
  return {
    reference_coverage: { complete: true, hidden_references_exist: false, queried_nodes: 2, failed_nodes: 0, index_freshness: 'current', excluded: [], ...coverage },
    linked_datasets: [{ document_id: 'd1', group_id: 'g', document_path: 'datasets/d1', graph_iri: 'i', title: 'One dataset', links: [] }],
  }
}

async function render() {
  const { root } = await mountApp(component, { props: { open: true, bucket } })
  await typeValue(element(root, (node) => node.props['data-name'] === true), 'spire')
  return root
}

describe('set delete dialog', () => {
  it('lists the datasets the node names and deletes once the name is typed', async () => {
    lookup.preflight.value = answer({})
    const root = await render()

    expect(content(root)).toContain('One dataset')
    expect(content(root)).toContain('Complete')
    expect(button(root, 'Delete bucket').props.disabled).toBe(false)
  })

  it('says what the list leaves out even when it is complete', async () => {
    lookup.preflight.value = answer({ excluded: ['hash_only_references'] })
    const root = await render()

    expect(content(root)).toContain('Complete')
    expect(content(root)).toContain('Datasets that name a file only by its content hash are not listed.')
    expect(button(root, 'Delete bucket').props.disabled).toBe(false)
  })

  it('asks for an acknowledgement while a node did not answer', async () => {
    lookup.preflight.value = answer({ complete: false, failed_nodes: 1 })
    const root = await render()

    expect(content(root)).toContain('1 node(s) did not answer.')
    expect(button(root, 'Delete bucket').props.disabled).toBe(true)
  })

  it('does not take a failed lookup for an empty list', async () => {
    lookup.preflight.value = null
    lookup.error.value = 'busy'
    const root = await render()

    expect(content(root)).toContain('The datasets could not be read: busy')
    expect(content(root)).not.toContain('None you can read.')
    expect(button(root, 'Delete bucket').props.disabled).toBe(true)
    lookup.error.value = null
  })
})
