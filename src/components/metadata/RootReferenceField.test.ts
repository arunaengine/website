import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  nodes,
} from '@/test/clientRender'
import * as EntityTemplates from '@/lib/crate/entityTemplates'
import type { ContextEntity } from '@/lib/crate/build'

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))

const RootReferenceField = compileClientComponent(new URL('./RootReferenceField.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/lib/crate/entityTemplates': EntityTemplates,
})

function person(id: string, name: string, roles: ContextEntity['roles']): ContextEntity {
  return { id, type: 'Person', properties: { name }, roles }
}

describe('RootReferenceField', () => {
  it('shows only the entities carrying its role', async () => {
    const mounted = await mountApp(RootReferenceField, {
      props: {
        label: 'Authors',
        role: 'author',
        entities: [person('#ada', 'Ada Example', ['author']), person('#bob', 'Bob Example', ['contributor'])],
      },
    })

    expect(content(mounted.root)).toContain('Ada Example')
    expect(content(mounted.root)).not.toContain('Bob Example')
    mounted.app.unmount()
  })

  it('removes the role rather than the entity', async () => {
    const remove = vi.fn()
    const entity = person('#ada', 'Ada Example', ['author', 'contributor'])
    const mounted = await mountApp(RootReferenceField, {
      props: { label: 'Authors', role: 'author', entities: [entity], onRemove: remove },
    })

    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Remove Ada Example from Authors'))

    expect(remove).toHaveBeenCalledWith('author', entity)
    mounted.app.unmount()
  })

  it('offers only matching types under Choose existing', async () => {
    const select = vi.fn()
    const organization: ContextEntity = { id: '#lab', type: 'Organization', properties: { name: 'Example Lab' }, roles: ['publisher'] }
    const bob = person('#bob', 'Bob Example', ['contributor'])
    const mounted = await mountApp(RootReferenceField, {
      props: { label: 'Authors', role: 'author', entities: [bob, organization], onSelect: select },
    })

    await click(button(mounted.root, 'Choose existing'))
    const options = nodes(mounted.root).filter((node) => node.props.role === 'option')

    expect(options).toHaveLength(1)
    await click(options[0])
    expect(select).toHaveBeenCalledWith('author', bob)
    mounted.app.unmount()
  })

  it('asks the parent to open the dialog for its role', async () => {
    const add = vi.fn()
    const mounted = await mountApp(RootReferenceField, {
      props: { label: 'Publisher', role: 'publisher', entities: [], onAdd: add },
    })

    await click(button(mounted.root, 'Add'))

    expect(add).toHaveBeenCalledWith('publisher')
    mounted.app.unmount()
  })
})
