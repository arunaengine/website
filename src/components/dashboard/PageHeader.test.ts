import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import { docsTopicBySlug, sectionId } from '@/docs/v1'

const viewsRoot = fileURLToPath(new URL('../../views', import.meta.url))

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : []
  })
}

interface Usage {
  file: string
  docs: string | undefined
}

// Every page writes its docs target as a literal object so the mapping can be
// checked against the manual instead of trusted.
function pageHeaders(): Usage[] {
  const usages: Usage[] = []
  for (const file of vueFiles(viewsRoot)) {
    const source = readFileSync(file, 'utf8')
    for (const tag of source.match(/<PageHeader\b[\s\S]*?>/g) ?? []) {
      usages.push({ file, docs: tag.match(/:docs="([^"]+)"/)?.[1] })
    }
  }
  return usages
}

describe('page header docs links', () => {
  it('maps every page except the manual itself to a topic and section that exist', () => {
    const usages = pageHeaders()
    expect(usages.length).toBeGreaterThan(20)

    for (const usage of usages) {
      if (basename(usage.file) === 'DocsView.vue') {
        expect(usage.docs).toBeUndefined()
        continue
      }
      expect(usage.docs, `${usage.file} has no docs target`).toBeDefined()
      const topic = docsTopicBySlug(usage.docs!.match(/topic: '([^']+)'/)?.[1] ?? '')
      expect(topic, `${usage.file} links to an unknown topic`).toBeDefined()
      const section = usage.docs!.match(/section: '([^']+)'/)?.[1]
      if (!section) continue
      const titles = topic!.sections.map((entry) => entry.title)
      expect(titles, `${usage.file} links to the unknown section ${section}`).toContain(section)
      expect(sectionId(section)).toBeTruthy()
    }
  })

  it('renders the docs link in the eyebrow row', async () => {
    vi.doMock('vue-router', () => ({
      RouterLink: defineComponent({
        props: { to: { type: Object, required: true } },
        setup: (props, { slots, attrs }) => () => h('a', { href: JSON.stringify(props.to), ...attrs }, slots.default?.()),
      }),
    }))
    vi.doMock('@/composables/useRealm', () => ({ useRealm: () => ({ realm: ref({ id: 'r', name: 'Realm' }) }) }))
    vi.doMock('@/components/ui/RealmBadge.vue', () => ({ default: defineComponent(() => () => h('span', 'realm')) }))
    const PageHeader = (await import('./PageHeader.vue')).default

    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(PageHeader, { title: 'Status', docs: { topic: 'realm-nodes-groups', section: 'Nodes and the realm' } }),
      }),
    )
    expect(html).toContain('realm-nodes-groups')
    expect(html).toContain('#nodes-and-the-realm')
    expect(html).toContain('Learn about nodes and the realm')

    const bare = await renderToString(createSSRApp({ render: () => h(PageHeader, { title: 'Docs' }) }))
    expect(bare).not.toContain('Learn about')

    vi.doUnmock('vue-router')
    vi.doUnmock('@/composables/useRealm')
    vi.doUnmock('@/components/ui/RealmBadge.vue')
  })
})
