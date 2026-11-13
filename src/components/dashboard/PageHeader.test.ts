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
  it('maps every page except the manual and legal documents to a topic and section that exist', () => {
    const usages = pageHeaders()
    expect(usages.length).toBeGreaterThan(20)

    for (const usage of usages) {
      // The manual and the legal documents have no manual topic of their own.
      if (['DocsView.vue', 'LegalView.vue'].includes(basename(usage.file))) {
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

  it('names realm, section and crumbs in a breadcrumb, and puts the docs icon button with the actions', async () => {
    vi.doMock('vue-router', () => ({
      RouterLink: defineComponent({
        props: { to: { type: [Object, String], required: true } },
        setup: (props, { slots, attrs }) => () => h('a', { href: JSON.stringify(props.to), ...attrs }, slots.default?.()),
      }),
      useRoute: () => ({ path: '/app/buckets/reef/storage' }),
    }))
    vi.doMock('@/composables/useRealm', () => ({ useRealm: () => ({ realmDisplayName: ref('Aruna_v3_Demo_Realm'), realmId: ref('k3V9xQ2m') }) }))
    const PageHeader = (await import('./PageHeader.vue')).default

    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(PageHeader, { title: 'Settings', crumbs: [{ label: 'reef', to: { name: 'bucket' } }, { label: 'Settings' }], docs: { topic: 'realm-nodes-groups', section: 'Nodes and the realm' } }),
      }),
    )
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'))
    expect(nav.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).toBe('Aruna_v3_Demo_Realm Data reef Settings')
    expect(html).toContain('lucide-globe')
    expect(html).toContain('title="k3V9xQ2m"')
    // The realm name leads back to the dashboard.
    expect(nav).toContain(`href="${JSON.stringify({ name: 'dashboard' }).replace(/"/g, '&quot;')}"`)
    expect(html).not.toContain('Portal')
    expect(html).toContain('class="type-page-title"')
    // The title wraps beside actions that never shrink; on a phone the actions go below it.
    expect(html).toContain('class="flex flex-col items-start gap-4 sm:flex-row sm:justify-between"')
    expect(html).toContain('class="min-w-0 flex-1"')
    expect(html).toContain('class="flex shrink-0 flex-wrap items-center gap-2"')
    // The docs link is a 36 px icon button whose label is its name and tooltip.
    expect(html).toContain('#nodes-and-the-realm')
    expect(html).toContain('aria-label="Read the docs"')
    expect(html).toContain('size-8')
    expect(html.replace(/<[^>]+>/g, ' ')).not.toContain('Read the docs')

    const bare = await renderToString(createSSRApp({ render: () => h(PageHeader, { title: 'Docs', eyebrow: 'Manual' }) }))
    expect(bare).not.toContain('Read the docs')
    expect(bare.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toContain('Aruna_v3_Demo_Realm Manual')

    vi.doUnmock('vue-router')
    vi.doUnmock('@/composables/useRealm')
  })
})
