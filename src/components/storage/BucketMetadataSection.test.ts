import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Databases from '@/lib/databases'
import * as Licenses from '@/lib/licenses'
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
// The license picker hands back the value it was given with the picked link.
const LicenseStub = defineComponent({
  props: { modelValue: Object, presets: Array },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('select', {
      'data-license': (props.modelValue as { value: string }).value,
      onChange: (event: { target: { value: string } }) => emit('update:modelValue', { ...(props.modelValue as object), value: event.target.value }),
    }, (props.presets as { value: string; label: string }[]).map((preset) => h('option', { value: preset.value }, preset.label))),
})
const RULES = { rules: [{ name: 'BioSample', pattern: 'SAMN\\d+', url: 'https://example.org/{0}' }] }
const EditorStub = defineComponent({
  emits: ['save'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('save', RULES) }, 'Use these rules'),
})

const component = compileClientComponent(new URL('./BucketMetadataSection.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) }) },
  '@/components/metadata/editor/ValueInput.vue': moduleDefault(LicenseStub),
  '@/lib/crate/editor': { LICENSE_PRESETS: [{ value: 'https://creativecommons.org/licenses/by/4.0/', label: 'CC BY 4.0' }] },
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
  '@/components/ui/SectionHeading.vue': moduleDefault(defineComponent({
    props: { title: String, count: String, info: String },
    setup: (props, { slots }) => () => h('div', [h('h2', props.title), props.count ?? '', props.info ? h('i', { 'data-info': props.info }) : null, slots.actions?.()]),
  })),
  '@/lib/licenses': Licenses,
  '@lucide/vue': { FileJson2: Slotted('i'), FileText: Slotted('i'), Link2: Slotted('i') },
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

  it('shows the license as a link with its SPDX id, every identifier and the dataset record', async () => {
    const ena = { name: 'ENA', value: 'PRJEB1234', url: 'https://www.ebi.ac.uk/ena/browser/view/PRJEB1234' }
    aruna.getBucketMetadata.mockResolvedValue({ ...stored, license: 'CC-BY-4.0', identifiers: [doi, ena], dataset: '01M63099Q2000108CB51QQDB2P' })
    const { root } = await mountApp(component, { props: { bucket: 'bakta-database', nodeId: null, canAdmin: false } })
    await flush()

    expect(anchors(root)).toContainEqual({ href: 'https://creativecommons.org/licenses/by/4.0/', text: 'CC BY 4.0' })
    expect(content(root)).toContain('CC-BY-4.0')
    expect(anchors(root)).toContainEqual({ href: ena.url, text: 'PRJEB1234' })
    const record = element(root, (node) => node.tag === 'a' && content(node).includes('Open the dataset'))
    expect(JSON.parse(String(record.props['data-to']))).toEqual({ name: 'dataset', params: { id: '01M63099Q2000108CB51QQDB2P' } })
  })

  it('picks the license from the presets and refuses a DOI or link it cannot read', async () => {
    aruna.getBucketMetadata.mockResolvedValue(stored)
    aruna.putBucketMetadata.mockReset().mockImplementation(async (_bucket: string, next: unknown) => next)
    const { root } = await mountApp(component, { props: { bucket: 'reads', nodeId: null, canAdmin: true } })
    await flush()
    const picker = element(root, (node) => node.tag === 'select')
    ;(picker.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'https://creativecommons.org/licenses/by/4.0/' } })
    await typeValue(element(root, (node) => node.tag === 'input' && node.props.id === 'bucket-page'), 'not a doi')
    await flush()

    expect(content(root)).toContain('Enter a DOI such as')
    expect(button(root, 'Save').props.disabled).toBe(true)

    await typeValue(element(root, (node) => node.tag === 'input' && node.props.id === 'bucket-page'), '10.5281/zenodo.14916843')
    await click(button(root, 'Save'))
    await flush()
    expect(aruna.putBucketMetadata.mock.calls[0][1]).toMatchObject({ license: 'https://creativecommons.org/licenses/by/4.0/', identifiers: [doi] })
  })

  it('offers the saved DOI as a link next to the field of an admin', async () => {
    aruna.getBucketMetadata.mockResolvedValue({ ...stored, identifiers: [doi] })
    const { root } = await mountApp(component, { props: { bucket: 'bakta-database', nodeId: null, canAdmin: true } })
    await flush()
    expect(anchors(root)).toContainEqual({ href: 'https://doi.org/10.5281/zenodo.14916843', text: 'Open' })
  })
})
