import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import AuthorChips from './AuthorChips.vue'

vi.mock('@/components/ui/Popover.vue', () => ({
  default: defineComponent({
    setup(_props, { slots }) {
      return () => slots.default?.()
    },
  }),
}))

vi.mock('@lucide/vue', () => {
  const icon = (name: string) =>
    defineComponent({
      inheritAttrs: false,
      setup(_props, { attrs }) {
        return () => h('i', { ...attrs, 'data-icon': name })
      },
    })
  return {
    Building2: icon('organization'),
    ExternalLink: icon('external'),
    User: icon('person'),
  }
})

function crateWithAuthor(type: string) {
  return {
    '@context': 'https://w3id.org/ro/crate/1.2/context',
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
      { '@id': './', '@type': 'Dataset', author: { '@id': '#lab' } },
      { '@id': '#lab', '@type': type, name: 'Example Research Lab' },
    ],
  }
}

describe('AuthorChips', () => {
  it.each(['ResearchOrganization', 'https://schema.org/ResearchOrganization'])(
    'renders a %s author as an organization',
    async (type) => {
      const app = createSSRApp({ render: () => h(AuthorChips, { crate: crateWithAuthor(type) }) })
      const html = await renderToString(app)

      expect(html).toContain('Example Research Lab')
      expect(html).toContain('data-icon="organization"')
      expect(html).not.toContain('data-icon="person"')
    },
  )
})
