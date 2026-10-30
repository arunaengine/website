import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import * as Editor from '@/lib/crate/editor'
import type { LiveIssue } from '@/lib/crate/editor'
import { compileClientComponent, content, mountApp, nodes } from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))

const IssueMark = compileClientComponent(new URL('./IssueMark.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/lib/crate/editor': Editor,
})

const missing: LiveIssue = { key: 'a', severity: 'error', message: 'Name is required.', entityId: '#a' }
const advised: LiveIssue = { key: 'b', severity: 'warning', message: 'Add a license.', entityId: '#a' }

async function render(issues: LiveIssue[]) {
  const { root, errors } = await mountApp(IssueMark, { props: { issues } })
  expect(errors).toEqual([])
  const items = nodes(root).filter((node) => node.tag === 'li')
  return { items, lines: items.map((node) => content(node).trim()) }
}

describe('IssueMark', () => {
  it('writes a blocking issue under the field in red', async () => {
    const { items, lines } = await render([missing])

    expect(lines).toEqual(['Requirement: Name is required.'])
    expect(items[0].props.class).toContain('text-destructive')
    expect(items[0].props['data-issue']).toBe('a')
  })

  it('writes advisory issues in amber', async () => {
    const { items, lines } = await render([advised, { ...advised, key: 'c', message: 'Add keywords.' }])

    expect(lines).toEqual(['Recommendation: Add a license.', 'Recommendation: Add keywords.'])
    expect(items.every((item) => String(item.props.class).includes('text-amber-700'))).toBe(true)
  })

  it('renders nothing without issues', async () => {
    const { items } = await render([])

    expect(items).toEqual([])
  })
})
