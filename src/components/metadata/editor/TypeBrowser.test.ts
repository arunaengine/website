import * as DataEntities from '@/lib/dataEntities'
import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { button, click, compileClientComponent, content, moduleDefault, mountApp, typeValue, element } from '@/test/clientRender'
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
  '@/lib/dataEntities': DataEntities,
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
  it('offers the profile types first, vocabulary or not', async () => {
    const updates: string[] = []
    const mounted = await mountApp(TypeBrowser, {
      props: {
        vocab,
        modelValue: '',
        profileTypes: [{ type: 'http://schema.org/Grant', label: 'Grant', description: 'The funding grant.' }],
        'onUpdate:modelValue': (value: string) => updates.push(value),
      },
    })

    await click(button(mounted.root, 'Grant'))

    expect(updates).toEqual(['Grant'])
    mounted.app.unmount()
  })

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

  it('offers only the common types of a range until a search asks for the others', async () => {
    const term = (name: string): VocabTerm => ({ uri: `http://schema.org/${name}`, name, label: name, description: '', source: 'schema.org' })
    const people = [term('Person'), term('Organization'), term('DanceGroup'), term('Casino')]
    const index = {
      classes: people,
      class: () => undefined,
      classesInRange: () => people,
      searchClasses: (query: string) => people.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase())),
    } as unknown as VocabIndex
    const mounted = await mountApp(TypeBrowser, { props: { vocab: index, modelValue: '', range: ['http://schema.org/Person'], onlyMatching: true, autoSelect: false } })

    expect(content(mounted.root)).toContain('PersonOrganization')
    expect(content(mounted.root)).not.toContain('Dance')
    expect(content(mounted.root)).toContain('Search to see every other type.')
    await typeValue(element(mounted.root, (node) => node.tag === 'input' && node.props['aria-label'] === 'Search entity types'), 'dance')
    expect(content(mounted.root)).toContain('Dance')
    mounted.app.unmount()
  })
})
