import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as TableImport from '@/lib/tableImport'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault, type HostNode } from '@/test/clientRender'

const createStagingJob = vi.fn(async () => ({ job_id: 'j1', created: true }))
const upload = vi.fn()
const source = { groupSel: ref('g1'), connectorSel: ref('c1'), connectorOptions: ref([{ value: 'c1', label: 'web (http)' }]) }

const Slotted = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const component = compileClientComponent(new URL('./ListImportTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Input.vue': moduleDefault(defineComponent({
    inheritAttrs: false,
    props: { modelValue: [String, Number] },
    setup: (props, { attrs }) => () => h('input', { ...attrs, value: props.modelValue }),
  })),
  '@/components/ui/OptionToggle.vue': moduleDefault(defineComponent({
    props: { modelValue: String },
    emits: ['update:modelValue'],
    setup: (_, { emit }) => () => h('div', [h('button', { onClick: () => emit('update:modelValue', 'upload') }, 'Upload source')]),
  })),
  '@/composables/useAruna': { useAruna: () => ({ createStagingJob }) },
  '@/composables/useS3': { useS3: () => ({ downloadUrl: async () => 'https://s3.test/list', uploadObject: upload }) },
  '@/lib/tableImport': TableImport,
  '@/lib/utils': { errorMessage: (cause: unknown) => (cause as Error).message },
})

const change = async (node: HostNode, value: string) => {
  ;(node.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } })
  await flush()
}
const labelled = (root: HostNode, label: string) => element(root, (node) => node.props['aria-label'] === label)

afterEach(() => vi.unstubAllGlobals())

describe('import from a list', () => {
  it('takes typed column names when the link gives no preview', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const { root } = await mountApp(component, { props: { bucket: 'samples', source } })
    await change(labelled(root, 'Link to the list'), 'https://data.example.org/list.csv')
    await flush()
    expect(content(root)).toContain('No preview from this link')

    await click(button(root, 'More options'))
    const header = element(root, (node) => node.tag === 'select' && content(node).includes('Typed in'))
    ;(header.props['onUpdate:modelValue'] as (value: string) => void)('columns')
    await flush()
    await change(labelled(root, 'Typed column names'), 'sample, url')

    expect(content(root)).toContain('sample')
    await click(button(root, 'Start import'))
    expect(createStagingJob).toHaveBeenCalledTimes(1)
    const body = createStagingJob.mock.calls[0] as unknown as [{ table: { format: { header: unknown }; rows: { source: string } } }]
    expect(body[0].table.format.header).toEqual({ columns: ['sample', 'url'] })
    expect(body[0].table.rows.source).toBe('{url}')
  })
})
