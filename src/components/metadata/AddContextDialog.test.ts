import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
} from '@/test/clientRender'
import * as CrateBuild from '@/lib/crate/build'
import * as EntityTemplates from '@/lib/crate/entityTemplates'
import * as EntityTypes from '@/lib/profiles/entityTypes'
import * as ProfileUri from '@/lib/profiles/uri'
import type { ContextEntity } from '@/lib/crate/build'

const cancelLookup = vi.fn()
const searchLookups = vi.fn(async (_kind, _query, update: (value: unknown) => void) => {
  update({ providerId: 'orcid', providerLabel: 'ORCID', status: 'offline', hits: [] })
})

const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
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
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs }) => () => h('select', { ...attrs, value: props.modelValue }),
})
const EmptyStub = defineComponent(() => () => null)

const LookupBox = compileClientComponent(new URL('./LookupBox.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/lib/lookup/registry': { cancelLookup, searchLookups },
})

const EntityTemplateForm = compileClientComponent(new URL('./EntityTemplateForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/metadata/LookupBox.vue': moduleDefault(LookupBox),
  '@/components/metadata/profile-builder/VocabSuggestions.vue': moduleDefault(EmptyStub),
  '@/lib/crate/build': CrateBuild,
  '@/lib/crate/entityTemplates': EntityTemplates,
  '@/lib/profiles/uri': ProfileUri,
})

const AddContextDialog = compileClientComponent(new URL('./AddContextDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Tabs.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsContent.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsList.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsTrigger.vue': moduleDefault(Passthrough),
  '@/components/metadata/EntityTemplateForm.vue': moduleDefault(EntityTemplateForm),
  '@/components/metadata/profile-builder/VocabSuggestions.vue': moduleDefault(EmptyStub),
  '@/lib/crate/entityTemplates': EntityTemplates,
  '@/lib/profiles/entityTypes': EntityTypes,
})

beforeEach(() => {
  vi.useFakeTimers()
  cancelLookup.mockClear()
  searchLookups.mockClear()
})

afterEach(() => vi.useRealTimers())

function fieldLabels(root: Parameters<typeof nodes>[0]): unknown[] {
  return nodes(root).filter((node) => node.tag === 'input').map((node) => node.props['aria-label'])
}

async function openTemplate(label: string, props: Record<string, unknown> = {}) {
  const mounted = await mountApp(AddContextDialog, { props: { open: true, entities: [], datasetEntities: [], ...props } })
  await click(button(mounted.root, label))
  return mounted
}

describe('AddContextDialog', () => {
  it('keeps the Person fields hidden until they are asked for', async () => {
    const mounted = await openTemplate('Person')
    const search = element(mounted.root, (node) => node.tag === 'input' && node.props.placeholder === 'Search ORCID by name or id')

    await typeValue(search, 'Ada')
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    expect(content(mounted.root)).toContain('ORCID is unavailable. Continue with the manual form below.')
    expect(fieldLabels(mounted.root)).not.toContain('Entity id')

    await click(button(mounted.root, 'Enter details manually'))

    expect(content(mounted.root)).toContain('Identifier')
    expect(fieldLabels(mounted.root)).toContain('Entity id')
    expect(fieldLabels(mounted.root)).toContain('Name')
    mounted.app.unmount()
  })

  it('reuses an existing entity when the entered id is a duplicate', async () => {
    const existing: ContextEntity = {
      id: 'https://orcid.org/0000-0002-1825-0097',
      type: 'Person',
      properties: { name: 'Ada Existing' },
      roles: ['contributor'],
    }
    const reuse = vi.fn()
    const mounted = await openTemplate('Person', { entities: [existing], onReuse: reuse })
    await click(button(mounted.root, 'Enter details manually'))
    const inputs = nodes(mounted.root).filter((node) => node.tag === 'input')
    const idInput = inputs.find((node) => node.props['aria-label'] === 'Entity id')!
    const nameInput = inputs.find((node) => node.props['aria-label'] === 'Name')!

    await typeValue(idInput, existing.id)
    await typeValue(nameInput, 'Ada Duplicate')
    const form = element(mounted.root, (node) => node.tag === 'form')
    await (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault() {} })
    await flush()

    expect(reuse).toHaveBeenCalledWith(expect.objectContaining({
      id: existing.id,
      roles: ['contributor', 'author'],
    }))
    mounted.app.unmount()
  })

  it('writes the fixed role a reference field asked for', async () => {
    // Opened from the Contributors field: no role chooser, the role is given.
    const save = vi.fn()
    const mounted = await mountApp(AddContextDialog, {
      props: { open: true, entities: [], datasetEntities: [], role: 'contributor', onSave: save },
    })
    await click(button(mounted.root, 'Enter details manually'))
    const nameInput = nodes(mounted.root).find((node) => node.props['aria-label'] === 'Name')!

    await typeValue(nameInput, 'Ada Example')
    const form = element(mounted.root, (node) => node.tag === 'form')
    await (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault() {} })
    await flush()

    expect(nodes(mounted.root).some((node) => node.props['aria-label'] === 'Root role')).toBe(false)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      entity: expect.objectContaining({ roles: ['contributor'] }),
    }))
    mounted.app.unmount()
  })

  it('starts a Something else entity with the default field set', async () => {
    const mounted = await openTemplate('Something else')

    expect(fieldLabels(mounted.root)).toEqual(
      expect.arrayContaining(['Name', 'Description', 'URL', 'Identifier']),
    )
    mounted.app.unmount()
  })

  it('adds a typed property to the form', async () => {
    const mounted = await openTemplate('Something else')
    await click(button(mounted.root, 'Add property'))
    const search = element(mounted.root, (node) => node.props['aria-label'] === 'Search properties')

    await typeValue(search, 'contentSize')
    await click(button(mounted.root, 'Use contentSize'))

    expect(fieldLabels(mounted.root)).toContain('contentSize')
    mounted.app.unmount()
  })
})
