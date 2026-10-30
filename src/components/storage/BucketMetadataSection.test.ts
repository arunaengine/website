import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Databases from '@/lib/databases'
import * as Licenses from '@/lib/licenses'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const DATASET = '01M63099Q2000108CB51QQDB2P'
const doi = { name: 'DOI', value: '10.5281/zenodo.14916843', url: 'https://doi.org/10.5281/zenodo.14916843' }
const ena = { name: 'ENA', value: 'PRJEB1234', url: 'https://www.ebi.ac.uk/ena/browser/view/PRJEB1234' }
const described = { title: 'Bakta database', description: 'Annotation database', version: '6.0', license: 'CC-BY-4.0', identifiers: [doi, ena] }
const linkedAnswer = { metadata: { database: false, dataset: DATASET }, description: described, description_unavailable: null }
const aruna = vi.hoisted(() => ({
  getBucketMetadata: vi.fn(),
  putBucketMetadata: vi.fn(),
  sessionEpoch: { value: 1 },
}))

const epoch = ref(1)

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const RULES = { rules: [{ name: 'BioSample', pattern: 'SAMN\\d+', url: 'https://example.org/{0}' }] }
const EditorStub = defineComponent({
  emits: ['save'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('save', RULES) }, 'Use these rules'),
})
// The form hands back what the node answered for the new or linked dataset.
const FormStub = defineComponent({
  props: { mode: String },
  emits: ['linked'],
  setup: (props, { emit }) => () => h('button', { 'data-mode': props.mode, onClick: () => emit('linked', linkedAnswer) }, 'Finish the form'),
})
const SwitchStub = defineComponent({
  inheritAttrs: false,
  props: { checked: Boolean, disabled: Boolean },
  emits: ['update:checked'],
  setup: (props, { emit }) => () => h('input', { type: 'checkbox', checked: props.checked, disabled: props.disabled, onClick: () => emit('update:checked', !props.checked) }),
})

const component = compileClientComponent(new URL('./BucketMetadataSection.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) }) },
  '@/components/settings/IdentifierLinksEditor.vue': moduleDefault(EditorStub),
  '@/components/storage/BucketDatasetForm.vue': moduleDefault(FormStub),
  '@/components/storage/BucketReleases.vue': moduleDefault(Slotted('div')),
  '@/components/ui/ExternalLink.vue': moduleDefault(defineComponent({
    inheritAttrs: false,
    props: { href: String, label: String },
    setup: (props) => () => h('a', { href: props.href, target: '_blank' }, props.label),
  })),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/SectionHeading.vue': moduleDefault(defineComponent({
    props: { title: String },
    setup: (props, { slots }) => () => h('div', [h('h2', props.title), slots.actions?.()]),
  })),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/lib/licenses': Licenses,
  '@lucide/vue': { FileJson2: Slotted('i'), FilePlus2: Slotted('i'), FileText: Slotted('i'), Link2: Slotted('i'), Pencil: Slotted('i') },
  '@/composables/useAruna': { useAruna: () => ({ ...aruna, sessionEpoch: epoch }) },
  '@/composables/useDatabases': { useDatabases: () => ({ reload: vi.fn() }) },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/databases': Databases,
})

const anchors = (root: Parameters<typeof content>[0]) =>
  (function walk(node: { tag?: string; props: Record<string, unknown>; children: unknown[] }): { href: unknown; text: string; to: unknown }[] {
    const own = node.tag === 'a' ? [{ href: node.props.href, text: content(node as never), to: node.props['data-to'] }] : []
    return [...own, ...(node.children as typeof node[]).flatMap(walk)]
  })(root as never)

describe('bucket description from its dataset', () => {
  it('shows the dataset: title, description, version, license with its SPDX id and identifiers as links', async () => {
    aruna.getBucketMetadata.mockResolvedValue(linkedAnswer)
    const { root } = await mountApp(component, { props: { bucket: 'bakta-database', nodeId: null, canAdmin: false } })
    await flush()
    const text = content(root)

    expect(text).toContain('Bakta database')
    expect(text).toContain('Annotation database')
    expect(text).toContain('6.0')
    expect(anchors(root)).toContainEqual(expect.objectContaining({ href: 'https://creativecommons.org/licenses/by/4.0/', text: 'CC BY 4.0' }))
    expect(text).toContain('CC-BY-4.0')
    expect(anchors(root)).toContainEqual(expect.objectContaining({ href: doi.url, text: doi.value }))
    expect(anchors(root)).toContainEqual(expect.objectContaining({ href: ena.url, text: ena.value }))
    const open = anchors(root).find((anchor) => anchor.text.includes('Open the dataset'))
    expect(JSON.parse(String(open?.to))).toEqual({ name: 'dataset', params: { id: DATASET } })
    expect(text).not.toContain('Edit the dataset')
  })

  it('edits through the dataset editor and says when the dataset cannot be read', async () => {
    aruna.getBucketMetadata.mockResolvedValue({ metadata: { database: true, dataset: DATASET }, description: null, description_unavailable: 'the dataset could not be read now' })
    const { root } = await mountApp(component, { props: { bucket: 'bakta-database', nodeId: null, canAdmin: true } })
    await flush()

    expect(content(root)).toContain('cannot be read now: the dataset could not be read now')
    const edit = anchors(root).find((anchor) => anchor.text.includes('Edit the dataset'))
    expect(JSON.parse(String(edit?.to))).toEqual({ name: 'dataset-edit', params: { id: DATASET } })
  })

  it('offers to describe or link a dataset, and allows "Show as database" only with one', async () => {
    aruna.getBucketMetadata.mockResolvedValue({ metadata: null, description: null })
    const { root } = await mountApp(component, { props: { bucket: 'reads', nodeId: null, canAdmin: true } })
    await flush()
    const toggle = () => element(root, (node) => node.tag === 'input' && node.props.type === 'checkbox')

    expect(content(root)).toContain('No dataset describes this bucket yet')
    expect(toggle().props.disabled).toBe(true)
    expect(content(root)).toContain('Link an existing dataset')
    await click(button(root, 'Describe this bucket as a dataset'))
    expect(element(root, (node) => node.props['data-mode'] === 'describe')).toBeTruthy()

    await click(button(root, 'Finish the form'))
    await flush()
    expect(content(root)).toContain('Annotation database')
    expect(toggle().props.disabled).toBe(false)
  })

  it('saves the database flag and the rules with one Save and sends no description fields', async () => {
    aruna.getBucketMetadata.mockResolvedValue(linkedAnswer)
    aruna.putBucketMetadata.mockReset().mockImplementation(async (_bucket: string, metadata: unknown) => ({ metadata, description: described }))
    const { root } = await mountApp(component, { props: { bucket: 'reads', nodeId: null, canAdmin: true } })
    await flush()

    await click(element(root, (node) => node.tag === 'input' && node.props.type === 'checkbox'))
    await click(button(root, 'Add a link rule'))
    await click(button(root, 'Use these rules'))
    await flush()
    expect(aruna.putBucketMetadata).not.toHaveBeenCalled()

    await click(button(root, 'Save'))
    await flush()
    expect(aruna.putBucketMetadata).toHaveBeenCalledOnce()
    expect(aruna.putBucketMetadata.mock.calls[0][1]).toEqual({ database: true, dataset: DATASET, parser: RULES })
    expect(content(root)).toContain('Saved.')
  })

  it('shows nothing of the previous account and drops its answers after a session change', async () => {
    // Other tests' sections still watch the shared epoch, so only this bucket's reads are queued.
    const answers: Promise<unknown>[] = [Promise.resolve(linkedAnswer)]
    aruna.getBucketMetadata.mockReset().mockImplementation((bucket: string) =>
      bucket === 'session-reads' ? answers.shift() : new Promise(() => {}))
    let earlier: (value: unknown) => void = () => {}
    let later: (value: unknown) => void = () => {}
    answers.push(new Promise((resolve) => { earlier = resolve }), new Promise((resolve) => { later = resolve }))
    const { root } = await mountApp(component, { props: { bucket: 'session-reads', nodeId: null, canAdmin: true } })
    await flush()
    expect(content(root)).toContain('Annotation database')

    epoch.value += 1
    await flush()
    expect(content(root)).not.toContain('Annotation database')
    expect(element(root, (node) => String(node.props.label).startsWith('Reading the description'))).toBeTruthy()

    epoch.value += 1
    await flush()
    later({ metadata: null, description: null })
    await flush()
    earlier(linkedAnswer)
    await flush()
    expect(content(root)).toContain('No dataset describes this bucket yet')
    expect(content(root)).not.toContain('Annotation database')
  })
})
