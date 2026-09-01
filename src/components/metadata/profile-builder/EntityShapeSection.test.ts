import * as VueRuntime from 'vue'
import { defineComponent, h, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { click, compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'
import * as EntityTypes from '@/lib/profiles/entityTypes'
import * as Labels from '@/lib/profiles/labels'
import * as PropertyCatalog from '@/lib/profiles/propertyCatalog'
import * as Uri from '@/lib/profiles/uri'
import { draftEntity, draftProperty, type DraftEntityRule } from './useProfileBuilder'

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const NoticeStub = defineComponent({
  props: { tone: { type: String, default: 'info' } },
  setup: (props, { slots }) => () => h('div', { 'data-tone': props.tone }, slots.default?.()),
})

const EntityShapeSection = compileClientComponent(new URL('./EntityShapeSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(EmptyStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Textarea.vue': moduleDefault(EmptyStub),
  '@/components/ui/Tooltip.vue': moduleDefault(Passthrough),
  './PropertyRuleRow.vue': moduleDefault(EmptyStub),
  './PropertyTermPicker.vue': moduleDefault(EmptyStub),
  './ClassPropertyChecklist.vue': moduleDefault(EmptyStub),
  './EntityTypePicker.vue': moduleDefault(EmptyStub),
  '@/lib/profiles/labels': Labels,
  '@/lib/profiles/entityTypes': EntityTypes,
  '@/lib/profiles/propertyCatalog': PropertyCatalog,
  '@/lib/profiles/uri': Uri,
})

function shape(type: string, label: string, lock?: 'full'): DraftEntityRule {
  return draftEntity({
    type,
    label,
    lock,
    properties: [draftProperty({ label: 'Name', propertyUri: 'http://schema.org/name', valueName: 'name' })],
  })
}

// The builder surface EntityShapeSection uses, with the reference traversal the
// real one derives from the rule set.
function builderFor(entities: DraftEntityRule[], references: Array<{ entityLabel: string; valueName: string }> = []) {
  return reactive({
    entities,
    entityReferences: () => references,
    entityObligation: () => ({ obligation: 'MAY' as const, via: undefined }),
    addReferenceProperty: (owner: DraftEntityRule, target: DraftEntityRule) => {
      references.push({ entityLabel: owner.label, valueName: target.label.toLowerCase() })
    },
    moveProperty: () => {},
    removeProperty: () => {},
    removeEntity: () => {},
  })
}

function mount(entity: DraftEntityRule, builder: ReturnType<typeof builderFor>) {
  return mountApp(EntityShapeSection, { props: { builder, entity } })
}

describe('EntityShapeSection notes', () => {
  it('says what an unreferenced shape does and does not do', async () => {
    const root = shape('http://schema.org/Dataset', 'Root dataset', 'full')
    const person = shape('http://schema.org/Person', 'Person')
    const mounted = await mount(person, builderFor([root, person]))

    const text = content(mounted.root)
    expect(text).toContain('No property asks for a Person yet')
    expect(text).toContain('still checked against these rules')
    expect(element(mounted.root, (node) => node.props['data-tone'] === 'info')).toBeDefined()
    mounted.app.unmount()
  })

  it('references the shape from the root on request', async () => {
    const root = shape('http://schema.org/Dataset', 'Root dataset', 'full')
    const person = shape('http://schema.org/Person', 'Person')
    const references: Array<{ entityLabel: string; valueName: string }> = []
    const builder = builderFor([root, person], references)
    const mounted = await mount(person, builder)

    await click(element(mounted.root, (node) =>
      node.tag === 'button' && content(node).trim().startsWith('Reference it from')))

    expect(references).toEqual([{ entityLabel: 'Root dataset', valueName: 'person' }])
    mounted.app.unmount()
  })

  it('stays quiet for the root and for an imported shape', async () => {
    const root = shape('http://schema.org/Dataset', 'Root dataset', 'full')
    const rootMount = await mount(root, builderFor([root]))
    expect(content(rootMount.root)).not.toContain('No property asks for')
    rootMount.app.unmount()

    const imported = shape('http://schema.org/Person', 'Person')
    imported.imported = true
    const importedMount = await mount(imported, builderFor([root, imported]))
    expect(content(importedMount.root)).not.toContain('No property asks for')
    importedMount.app.unmount()
  })

  it('warns that a second Dataset shape also targets the root', async () => {
    const root = shape('http://schema.org/Dataset', 'Root dataset', 'full')
    const part = shape('http://schema.org/Dataset', 'Part dataset')
    const mounted = await mount(part, builderFor([root, part]))

    expect(content(mounted.root)).toContain('This shape targets every Dataset, including the root')
    mounted.app.unmount()
  })
})
