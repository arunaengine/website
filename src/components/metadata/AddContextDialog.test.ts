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
import * as EntityTemplates from '@/lib/crate/entityTemplates'
import * as EntityTypes from '@/lib/profiles/entityTypes'
import type { ContextEntity } from '@/lib/crate/build'

const cancelLookup = vi.fn()
const searchLookups = vi.fn(async (_kind, _query, update: (value: unknown) => void) => {
  update({ providerId: 'orcid', providerLabel: 'ORCID', status: 'offline', hits: [] })
})

const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
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
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/metadata/LookupBox.vue': moduleDefault(LookupBox),
})

const AddContextDialog = compileClientComponent(new URL('./AddContextDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Tabs.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsContent.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsList.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsTrigger.vue': moduleDefault(Passthrough),
  '@/components/metadata/EntityTemplateForm.vue': moduleDefault(EntityTemplateForm),
  '@/lib/crate/entityTemplates': EntityTemplates,
  '@/lib/profiles/entityTypes': EntityTypes,
})

beforeEach(() => {
  vi.useFakeTimers()
  cancelLookup.mockClear()
  searchLookups.mockClear()
})

afterEach(() => vi.useRealTimers())

async function openPerson(props: Record<string, unknown>) {
  const mounted = await mountApp(AddContextDialog, { props: { open: true, datasetEntities: [], ...props } })
  await click(button(mounted.root, 'Person'))
  return mounted
}

describe('AddContextDialog', () => {
  it('shows the manual Person form when ORCID is offline', async () => {
    const mounted = await openPerson({ entities: [] })
    const search = element(mounted.root, (node) => node.tag === 'input' && node.props.placeholder === 'Search ORCID by name or id')

    await typeValue(search, 'Ada')
    await vi.advanceTimersByTimeAsync(300)
    await flush()

    expect(content(mounted.root)).toContain('ORCID is unavailable. Continue with the manual form below.')
    expect(content(mounted.root)).toContain('@id')
    expect(content(mounted.root)).toContain('Name')
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
    const mounted = await openPerson({ entities: [existing], onReuse: reuse })
    const inputs = nodes(mounted.root).filter((node) => node.tag === 'input')
    const idInput = inputs.find((node) => node.props.placeholder === '#entity-name')!
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
})
