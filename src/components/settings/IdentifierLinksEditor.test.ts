import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Links from '@/lib/identifierLinks'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault, typeValue } from '@/test/clientRender'

const aruna = vi.hoisted(() => ({ testIdentifierRules: vi.fn() }))

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Field = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})

const component = compileClientComponent(new URL('./IdentifierLinksEditor.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Field),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/identifierLinks': Links,
})

const field = (root: Parameters<typeof element>[0], label: string) => element(root, (node) => node.tag === 'input' && node.props['aria-label'] === label)

async function render(parser: unknown = null) {
  const saved = vi.fn()
  const { root } = await mountApp(component, { props: { parser, onSave: saved } })
  return { root, saved }
}

describe('identifier links editor', () => {
  beforeEach(() => {
    aruna.testIdentifierRules.mockReset()
  })

  it('starts from a preset and tries it with the server', async () => {
    const { root } = await render()
    await click(button(root, 'BioSample'))
    await click(button(root, 'NCBI assembly'))
    aruna.testIdentifierRules.mockResolvedValue([{ name: 'BioSample', value: 'SAMN1', url: 'https://x.org/SAMN1', target: 'key' }])
    await typeValue(field(root, 'File path or source link'), 'genes/SAMN1.faa.gz')
    await click(button(root, 'Try'))

    const sent = aruna.testIdentifierRules.mock.calls[0][0]
    expect(sent.key).toBe('genes/SAMN1.faa.gz')
    expect(sent.parser.rules.map((rule: { name: string }) => rule.name)).toEqual(['BioSample', 'NCBI assembly'])
    expect(content(root)).toContain('SAMN1 ↗')
    expect(content(root)).toContain('NCBI assembly: no match')
  })

  it('tries a source link as one', async () => {
    const { root } = await render({ rules: [Links.PRESETS[4]] })
    aruna.testIdentifierRules.mockResolvedValue([])
    await typeValue(field(root, 'File path or source link'), 'https://zenodo.org/records/12')
    await click(button(root, 'Try'))

    expect(aruna.testIdentifierRules.mock.calls[0][0]).toMatchObject({ key: '', source_url: 'https://zenodo.org/records/12' })
  })

  it('names a broken rule and saves only a valid parser', async () => {
    const { root, saved } = await render({ rules: [{ ...Links.PRESETS[1], pattern: '(GC[AF]_\\d+)' }] })
    expect(content(root)).toContain('Rule 1: the pattern needs a part named id')
    expect(button(root, 'Save').props.disabled).toBe(true)

    await typeValue(field(root, 'Pattern'), Links.PRESETS[1].pattern)
    await click(button(root, 'Save'))
    expect(saved).toHaveBeenCalledWith({ rules: [Links.PRESETS[1]] })
  })

  it('removes all links at once', async () => {
    const { root, saved } = await render({ rules: [Links.PRESETS[0]] })
    await click(button(root, 'Remove all links'))

    expect(saved).toHaveBeenCalledWith(null)
  })
})
