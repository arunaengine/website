import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  type HostNode,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Uri from '@/lib/profiles/uri'
import type { VocabIndex, VocabTerm } from '@/lib/profiles/vocabulary'

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', {
    ...attrs,
    value: props.modelValue,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
})
// The dialog shell: a header, a search box that goes once something is picked.
const CommandDialogStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, title: String, picked: Boolean },
  setup(props, { slots }) {
    return () => h('div', [
      h('h2', props.title),
      slots.subtitle?.(),
      props.picked ? null : h('input', { 'aria-label': 'Search entity types' }),
      slots.default?.(),
      slots.footer?.(),
    ])
  },
})

const TypeBrowser = compileClientComponent(new URL('./TypeBrowser.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/lib/crate/editor': Editor,
  '@/lib/profiles/uri': Uri,
})

const TypeDialog = compileClientComponent(new URL('./TypeDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CommandDialog.vue': moduleDefault(CommandDialogStub),
  './TypeBrowser.vue': moduleDefault(TypeBrowser),
  '@/lib/crate/editor': Editor,
})

const person: VocabTerm = {
  uri: 'http://schema.org/Person',
  name: 'Person',
  label: 'Person',
  description: 'A person, alive or dead.',
  source: 'schema.org',
}
const vocab = {
  classes: [person],
  class: () => person,
  classesInRange: () => [],
  searchClasses: () => [person],
} as unknown as VocabIndex

function mount(picked: string[] = []) {
  return mountApp(TypeDialog, { props: { open: true, vocab, onPick: (type: string) => picked.push(type) } })
}

function search(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === 'Search entity types')
}

describe('TypeDialog', () => {
  it('names the picked type instead of the search', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Person'))

    expect(() => search(mounted.root)).toThrow()
    expect(content(element(mounted.root, (node) => node.tag === 'h2'))).toBe('Person')
    expect(content(mounted.root)).toContain('A person, alive or dead.')
    mounted.app.unmount()
  })

  it('adds the type only once the footer confirms it', async () => {
    const picked: string[] = []
    const mounted = await mount(picked)

    await click(button(mounted.root, 'Person'))
    expect(picked).toEqual([])

    await click(button(mounted.root, 'Add type'))

    expect(picked).toEqual(['Person'])
    mounted.app.unmount()
  })

  it('returns to the search from the footer', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Person'))
    await click(button(mounted.root, 'Back'))

    expect(content(search(mounted.root))).toBe('')
    mounted.app.unmount()
  })
})
