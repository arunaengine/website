import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import { docsTopicBySlug, sectionId } from '@/docs/v1'

const sourceRoot = fileURLToPath(new URL('../..', import.meta.url))

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : []
  })
}

interface Usage {
  file: string
  topic: string
  section?: string
}

// Every DocsLink in the portal is written with literal attributes so this scan
// can check the target instead of trusting the author.
function docsLinkUsages(): Usage[] {
  const usages: Usage[] = []
  for (const file of vueFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8')
    for (const tag of source.match(/<DocsLink\b[^>]*>/g) ?? []) {
      const topic = tag.match(/\stopic="([^"]+)"/)?.[1]
      const section = tag.match(/\ssection="([^"]+)"/)?.[1]
      if (topic) usages.push({ file, topic, section })
    }
  }
  return usages
}

describe('docs links', () => {
  it('renders the section anchor of its topic', async () => {
    vi.doMock('vue-router', () => ({
      RouterLink: defineComponent({
        props: { to: { type: Object, required: true } },
        setup: (props, { slots }) => () =>
          h('a', { href: JSON.stringify(props.to) }, slots.default?.()),
      }),
    }))
    const DocsLink = (await import('./DocsLink.vue')).default
    const html = await renderToString(
      createSSRApp({
        render: () => h(DocsLink, { topic: 'where-data-lives', section: 'Placement policies' }),
      }),
    )

    expect(html).toContain('where-data-lives')
    expect(html).toContain('#placement-policies')
    expect(html).toContain('Learn about placement policies')
    vi.doUnmock('vue-router')
  })

  it('points every usage at a topic and section that exist', () => {
    const usages = docsLinkUsages()

    expect(usages.length).toBeGreaterThan(0)
    for (const usage of usages) {
      const topic = docsTopicBySlug(usage.topic)
      expect(topic, `${usage.file} links to the unknown topic ${usage.topic}`).toBeDefined()
      if (!usage.section) continue
      const titles = topic!.sections.map((section) => section.title)
      expect(
        titles,
        `${usage.file} links to the unknown section ${usage.section} of ${usage.topic}`,
      ).toContain(usage.section)
      expect(sectionId(usage.section)).toBeTruthy()
    }
  })
})
