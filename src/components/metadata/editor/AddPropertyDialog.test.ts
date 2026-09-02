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
import * as ProfileSeed from '@/lib/crate/profileSeed'
import * as Uri from '@/lib/profiles/uri'
import type { ProfilePropertyRule } from '@/lib/profiles/types'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
// The dialog shell reduced to its header, its search box and its slots. The
// search box goes away once the host has picked something, as it does live.
const CommandDialogStub = defineComponent({
  props: {
    modelValue: { type: String, default: '' },
    ariaLabel: String,
    placeholder: String,
    title: String,
    description: String,
    picked: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () => h('div', [
      h('h2', props.title),
      h('p', props.description),
      slots.subtitle?.(),
      props.picked
        ? null
        : h('input', {
            'aria-label': props.ariaLabel ?? props.placeholder,
            value: props.modelValue,
            onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
          }),
      slots.default?.(),
      slots.footer?.(),
    ])
  },
})

const AddPropertyDialog = compileClientComponent(new URL('./AddPropertyDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CommandDialog.vue': moduleDefault(CommandDialogStub),
  '@/lib/crate/editor': Editor,
  '@/lib/crate/profileSeed': ProfileSeed,
  '@/lib/profiles/uri': Uri,
})

function mount(
  entity: Editor.DraftEntity,
  picked: Array<{ key: string; kind: string }> = [],
  profile: Record<string, unknown> = {},
) {
  return mountApp(AddPropertyDialog, {
    props: {
      open: true,
      entity,
      vocab,
      ...profile,
      onPick: (value: { key: string; kind: string }) => picked.push(value),
    },
  })
}

const startTime: ProfilePropertyRule = {
  id: 'start-time',
  label: 'Start time',
  description: 'When the run started.',
  kind: 'datetime',
  propertyUri: 'http://schema.org/startTime',
  valueName: 'startTime',
  obligation: 'MAY',
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

describe('AddPropertyDialog', () => {
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
    await click(row(mounted.root, 'Add property'))

    expect(picked).toEqual([{ key: 'license', kind: 'url' }])
    mounted.app.unmount()
  })

  it('offers what the profile still suggests before the vocabulary', async () => {
    const picked: Array<{ key: string; kind: string }> = []
    const mounted = await mount(dataset, picked, {
      suggestions: [startTime],
      profileName: 'Process Run Crate',
    })
    const text = content(mounted.root)

    expect(text).toContain('Suggested by Process Run Crate')
    expect(text).toContain('When the run started.')
    // The profile's own suggestion is listed above the vocabulary's.
    expect(text.indexOf('Start time')).toBeLessThan(text.indexOf('License'))
    await click(row(mounted.root, 'Start time'))

    // The rule knows the kind, so the picker does not ask again.
    expect(picked).toEqual([{ key: 'startTime', kind: 'datetime' }])
    mounted.app.unmount()
  })

  it('lists a suggested property once', async () => {
    const license: ProfilePropertyRule = { ...startTime, id: 'license', label: 'License', valueName: 'license', kind: 'url' }
    const mounted = await mount(dataset, [], { suggestions: [license], profileName: 'Process Run Crate' })

    expect(content(mounted.root).match(/License/g)).toHaveLength(1)
    mounted.app.unmount()
  })

  it('names the property it is asking about', async () => {
    // The search goes away, so the header has to say what was picked.
    const mounted = await mount(dataset)
    await typeValue(search(mounted.root), 'license')
    await click(row(mounted.root, 'License'))
    await flush()

    expect(() => search(mounted.root)).toThrow()
    expect(content(element(mounted.root, (node) => node.tag === 'h2'))).toBe('License')
    expect(content(element(mounted.root, (node) => String(node.props.class ?? '').includes('hash')))).toBe('license')

    await click(row(mounted.root, 'Back'))

    expect(content(search(mounted.root))).toBe('')
    mounted.app.unmount()
  })
})
