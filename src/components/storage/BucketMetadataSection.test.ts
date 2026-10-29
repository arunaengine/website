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
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Field),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Switch.vue': moduleDefault(Slotted('span')),
  '@/composables/useAruna': { useAruna: () => ({ ...aruna, sessionEpoch: ref(1) }) },
  '@/composables/useDatabases': { useDatabases: () => ({ reload: vi.fn() }) },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/databases': Databases,
  '@lucide/vue': { Tags: Slotted('span') },
})

describe('bucket metadata', () => {
  it('keeps edited rules with the other fields and stores them with the one Save', async () => {
    aruna.getBucketMetadata.mockResolvedValue(stored)
    aruna.putBucketMetadata.mockImplementation(async (_bucket: string, next: unknown) => next)
    const { root } = await mountApp(component, { props: { bucket: 'reads', nodeId: null, canAdmin: true } })

    await typeValue(element(root, (node) => node.tag === 'input' && node.props.id === 'bucket-title'), 'New title')
    await click(button(root, 'Edit'))
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
})
