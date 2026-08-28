import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Uri from '@/lib/profiles/uri'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    })
  },
})

const AddPropertyPopover = compileClientComponent(new URL('./AddPropertyPopover.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/lib/crate/editor': Editor,
  '@/lib/profiles/uri': Uri,
})

function mount(entity: Editor.DraftEntity, picked: Array<{ key: string; kind: string }> = []) {
  return mountApp(AddPropertyPopover, {
    props: { entity, vocab, onPick: (value: { key: string; kind: string }) => picked.push(value) },
  })
}

const dataset: Editor.DraftEntity = {
  id: './',
  types: ['Dataset'],
  properties: { name: [{ kind: 'text', value: 'Example' }] },
}

function search(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === 'Search properties')
}

function row(root: HostNode, label: string): HostNode {
  const match = nodes(root).find((node) => node.tag === 'button' && content(node).trim().startsWith(label))
  if (!match) throw new Error(`No property row for ${label}`)
  return match
}

describe('AddPropertyPopover', () => {
  it('suggests the properties the entity type carries', async () => {
    const mounted = await mount(dataset)
    const text = content(mounted.root)

    expect(text).toContain('Suggested for Dataset')
    expect(text).toContain('License')
    expect(text).not.toContain('Family name')
    mounted.app.unmount()
  })

  it('finds a property outside the type under all properties', async () => {
    const mounted = await mount(dataset)
    await typeValue(search(mounted.root), 'familyName')

    expect(content(mounted.root)).toContain('Family name')
    mounted.app.unmount()
  })

  it('hides the properties already on the entity', async () => {
    const mounted = await mount({ ...dataset, properties: { ...dataset.properties, license: [] } })

    expect(content(mounted.root)).not.toContain('License')
    mounted.app.unmount()
  })

  it('offers a custom term for a CURIE', async () => {
    const picked: Array<{ key: string; kind: string }> = []
    const mounted = await mount(dataset, picked)
    await typeValue(search(mounted.root), 'ex:measurementDevice')

    expect(content(mounted.root)).toContain('Use custom term')
    await click(row(mounted.root, 'Use custom term'))

    expect(picked).toEqual([{ key: 'ex:measurementDevice', kind: 'text' }])
    mounted.app.unmount()
  })

  it('asks which kind of value a mixed range takes', async () => {
    const picked: Array<{ key: string; kind: string }> = []
    const mounted = await mount(dataset, picked)
    await typeValue(search(mounted.root), 'license')
    await click(row(mounted.root, 'License'))
    await flush()

    expect(content(mounted.root)).toContain('What kind of value does license take?')
    await click(row(mounted.root, 'URL'))

    expect(picked).toEqual([{ key: 'license', kind: 'url' }])
    mounted.app.unmount()
  })
})
