import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  type HostNode,
} from '@/test/clientRender'
import * as Identifiers from '@/lib/identifiers'
import * as Utils from '@/lib/utils'
import type { ContextualEntity } from '@/lib/contextualEntities'

const EmptyStub = defineComponent(() => () => null)
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const LinkStub = defineComponent({
  props: { href: String, label: String },
  setup: (props, { attrs }) => () => h('a', { ...attrs, href: props.href }, props.label),
})
// Keeps the route target inspectable: the harness records every prop it sets.
const RouterLinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { attrs, slots }) => () => h('a', { ...attrs, to: props.to }, slots.default?.()),
})

const ContextualEntityCard = compileClientComponent(new URL('./ContextualEntityCard.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/ExternalLink.vue': moduleDefault(LinkStub),
  '@/lib/identifiers': Identifiers,
  '@/lib/utils': Utils,
})

function entity(overrides: Partial<ContextualEntity> = {}): ContextualEntity {
  return {
    id: '#ada',
    name: 'Ada Lovelace',
    types: ['Person'],
    roles: ['Author'],
    affiliations: [],
    unresolved: false,
    ...overrides,
  }
}

function findLink(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'a' && content(node).includes('Find datasets'))
}

async function mount(row: ContextualEntity, kind: 'people' | 'organizations' = 'people') {
  return mountApp(ContextualEntityCard, { props: { entity: row, kind } })
}

describe('ContextualEntityCard', () => {
  it('searches a local entity by name', async () => {
    const mounted = await mount(entity())

    expect(findLink(mounted.root).props.to).toEqual({ name: 'datasets', query: { q: 'Ada Lovelace' } })
    mounted.app.unmount()
  })

  it('searches an ORCID as its full IRI', async () => {
    // A bare ORCID id must still search as the resolvable form the crates carry.
    const mounted = await mount(entity({ id: '0000-0002-1825-0097', orcid: '0000-0002-1825-0097' }))

    expect(findLink(mounted.root).props.to).toEqual({
      name: 'datasets',
      query: { q: 'https://orcid.org/0000-0002-1825-0097' },
    })
    mounted.app.unmount()
  })

  it('searches an organization by ROR', async () => {
    const mounted = await mount(
      entity({ id: 'https://ror.org/05f950310', name: 'Example University', roles: ['Publisher'] }),
      'organizations',
    )

    expect(findLink(mounted.root).props.to).toEqual({
      name: 'datasets',
      query: { q: 'https://ror.org/05f950310' },
    })
    mounted.app.unmount()
  })

  it('searches any other IRI as itself', async () => {
    const mounted = await mount(entity({ id: 'https://example.org/people/ada' }))

    expect(findLink(mounted.root).props.to).toEqual({
      name: 'datasets',
      query: { q: 'https://example.org/people/ada' },
    })
    mounted.app.unmount()
  })
})
