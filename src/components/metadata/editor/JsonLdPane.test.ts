import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import * as CrateImport from '@/lib/crateImport'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, moduleDefault, mountApp, typeValue } from '@/test/clientRender'

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const NoticeStub = defineComponent({
  props: { title: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('div', [props.title, ' ', slots.default?.()]),
})
const TextareaStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('textarea', {
    ...attrs,
    value: props.modelValue,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
})

const JsonLdPane = compileClientComponent(new URL('./JsonLdPane.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(EmptyStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Textarea.vue': moduleDefault(TextareaStub),
  '@/lib/crateImport': CrateImport,
  '@/lib/utils': Utils,
})

const crate = {
  '@context': 'https://w3id.org/ro/crate/1.2/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Before' },
  ],
}

async function mount(applied: unknown[], changes: boolean[] = []) {
  const mounted = await mountApp(JsonLdPane, {
    props: { rocrate: crate, onApply: (next: unknown) => applied.push(next), onChanged: (value: boolean) => changes.push(value) },
  })
  const field = element(mounted.root, (node) => node.tag === 'textarea')
  return { ...mounted, field }
}

describe('JsonLdPane', () => {
  it('applies edited JSON-LD', async () => {
    const applied: unknown[] = []
    const { root, field, app } = await mount(applied)
    expect(String(field.props.value)).toContain('"Before"')

    await typeValue(field, String(field.props.value).replace('Before', 'After'))
    await click(button(root, 'Apply'))

    expect(applied).toHaveLength(1)
    expect(JSON.stringify(applied[0])).toContain('"After"')
    app.unmount()
  })

  it('keeps the draft when the text is not a crate', async () => {
    const applied: unknown[] = []
    const { root, field, app } = await mount(applied)

    await typeValue(field, '{ "@graph": ')
    await click(button(root, 'Apply'))

    expect(applied).toEqual([])
    expect(content(root)).toContain('The JSON-LD could not be read')
    expect(content(root)).toContain('Not valid JSON')
    app.unmount()
  })

  it('says when the text differs from the editor', async () => {
    const changes: boolean[] = []
    const { field, app } = await mount([], changes)
    const original = String(field.props.value)

    await typeValue(field, `${original} `)
    await typeValue(field, original)

    expect(changes).toEqual([true, false])
    app.unmount()
  })
})
