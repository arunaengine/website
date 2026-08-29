import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { button, click, compileClientComponent, moduleDefault, mountApp } from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Uri from '@/lib/profiles/uri'
import type { VocabIndex, VocabTerm } from '@/lib/profiles/vocabulary'

const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', {
    ...attrs,
    value: props.modelValue,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
})

const TypeBrowser = compileClientComponent(new URL('./TypeBrowser.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/lib/crate/editor': Editor,
  '@/lib/profiles/uri': Uri,
})

const agent: VocabTerm = {
  uri: 'http://purl.org/dc/terms/Agent',
  name: 'Agent',
  label: 'Agent',
  description: 'A resource that acts.',
  source: 'dcterms',
}
const vocab = {
  classes: [agent],
  class: () => undefined,
  classesInRange: () => [agent],
  searchClasses: () => [agent],
} as unknown as VocabIndex

describe('TypeBrowser', () => {
  it('emits an external vocabulary class as its absolute IRI', async () => {
    const updates: string[] = []
    const mounted = await mountApp(TypeBrowser, {
      props: {
        vocab,
        modelValue: '',
        range: [agent.uri],
        onlyMatching: true,
        'onUpdate:modelValue': (value: string) => updates.push(value),
      },
    })

    await click(button(mounted.root, 'Agent'))

    expect(updates).toEqual([agent.uri])
    mounted.app.unmount()
  })
})
