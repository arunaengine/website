import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Databases from '@/lib/databases'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault, typeValue } from '@/test/clientRender'

const stored = { database: false, title: 'Old title', license: null, identifiers: [] }
const aruna = vi.hoisted(() => ({
  getBucketMetadata: vi.fn(),
  putBucketMetadata: vi.fn(),
  sessionEpoch: { value: 1 },
}))

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Field = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})
const RULES = { rules: [{ name: 'BioSample', pattern: 'SAMN\\d+', url: 'https://example.org/{0}' }] }
const EditorStub = defineComponent({
  emits: ['save'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('save', RULES) }, 'Use these rules'),
})

const component = compileClientComponent(new URL('./BucketMetadataSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/settings/IdentifierLinksEditor.vue': moduleDefault(EditorStub),
  '@/components/storage/BucketReleases.vue': moduleDefault(Slotted('div')),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/ExternalLink.vue': moduleDefault(defineComponent({
    inheritAttrs: false,
    props: { href: String, label: String },
    setup: (props) => () => h('a', { href: props.href, target: '_blank' }, props.label),
  })),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Field),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Switch.vue': moduleDefault(Slotted('span')),
  '@/composables/useAruna': { useAruna: () => ({ ...aruna, sessionEpoch: ref(1) }) },
  '@/composables/useDatabases': { useDatabases: () => ({ reload: vi.fn() }) },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/databases': Databases,
})

describe('bucket metadata', () => {
  it('keeps edited rules with the other fields and stores them with the one Save', async () => {
    aruna.getBucketMetadata.mockResolvedValue(stored)
    aruna.putBucketMetadata.mockImplementation(async (_bucket: string, next: unknown) => next)
    const { root } = await mountApp(component, { props: { bucket: 'reads', nodeId: null, canAdmin: true } })

    await typeValue(element(root, (node) => node.tag === 'input' && node.props.id === 'bucket-title'), 'New title')
    await click(button(root, 'Add a link rule'))
    await click(button(root, 'Use these rules'))
    await flush()

    expect(aruna.putBucketMetadata).not.toHaveBeenCalled()
    expect(content(root)).toContain('1 rule')
    expect((element(root, (node) => node.tag === 'input' && node.props.id === 'bucket-title').props.value)).toBe('New title')

    await click(button(root, 'Save'))
    await flush()

    expect(aruna.putBucketMetadata).toHaveBeenCalledOnce()
    expect(aruna.putBucketMetadata.mock.calls[0][1]).toMatchObject({ title: 'New title', parser: RULES })
    expect(content(root)).toContain('Saved.')
  })

  it('stores the version and puts unsaved edits back with Discard', async () => {
    aruna.getBucketMetadata.mockResolvedValue({ ...stored, version: '5.1' })
    aruna.putBucketMetadata.mockReset()
    aruna.putBucketMetadata.mockImplementation(async (_bucket: string, next: unknown) => next)
    const { root } = await mountApp(component, { props: { bucket: 'reads', nodeId: null, canAdmin: true } })
    const field = (id: string) => element(root, (node) => node.tag === 'input' && node.props.id === id)

    expect(field('bucket-version').props.value).toBe('5.1')
    await typeValue(field('bucket-title'), 'Draft title')
    await click(button(root, 'Discard'))
    expect(field('bucket-title').props.value).toBe('Old title')

    await typeValue(field('bucket-version'), '6.0')
    await click(button(root, 'Save'))
    await flush()
    expect(aruna.putBucketMetadata.mock.calls[0][1]).toMatchObject({ title: 'Old title', version: '6.0' })
  })
})

describe('bucket metadata links', () => {
  const doi = { name: 'DOI', value: '10.5281/zenodo.14916843', url: 'https://doi.org/10.5281/zenodo.14916843' }
  const anchors = (root: Parameters<typeof content>[0]) =>
    (function walk(node: { tag?: string; props: Record<string, unknown>; children: unknown[] }): { href: unknown; text: string }[] {
      const own = node.tag === 'a' ? [{ href: node.props.href, text: content(node as never) }] : []
      return [...own, ...(node.children as typeof node[]).flatMap(walk)]
    })(root as never)

  it('shows a saved DOI as a link to doi.org and a saved link as itself', async () => {
    aruna.getBucketMetadata.mockResolvedValue({ ...stored, identifiers: [doi] })
    const reader = await mountApp(component, { props: { bucket: 'bakta-database', nodeId: null, canAdmin: false } })
    await flush()
    expect(anchors(reader.root)).toContainEqual({ href: 'https://doi.org/10.5281/zenodo.14916843', text: '10.5281/zenodo.14916843' })

    aruna.getBucketMetadata.mockResolvedValue({ ...stored, identifiers: [{ name: 'Link', value: 'https://example.org/db', url: 'https://example.org/db' }] })
    const linked = await mountApp(component, { props: { bucket: 'other', nodeId: null, canAdmin: false } })
    await flush()
    expect(anchors(linked.root)).toContainEqual({ href: 'https://example.org/db', text: 'https://example.org/db' })
  })

  it('offers the saved DOI as a link next to the field of an admin', async () => {
    aruna.getBucketMetadata.mockResolvedValue({ ...stored, identifiers: [doi] })
    const { root } = await mountApp(component, { props: { bucket: 'bakta-database', nodeId: null, canAdmin: true } })
    await flush()
    expect(anchors(root)).toContainEqual({ href: 'https://doi.org/10.5281/zenodo.14916843', text: 'Open' })
  })
})

