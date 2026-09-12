import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import * as Editor from '@/lib/crate/editor'
import type { LiveIssue } from '@/lib/crate/editor'
import { compileClientComponent, content, element, mountApp, nodes } from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const PopoverStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { slots }) => () => h('div', [slots.default?.(), slots.content?.()]),
})

const IssueMark = compileClientComponent(new URL('./IssueMark.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Popover.vue': { __esModule: true, default: PopoverStub },
  '@/lib/crate/editor': Editor,
})

const missing: LiveIssue = { key: 'a', severity: 'error', message: 'Name is required.', entityId: '#a' }
const advised: LiveIssue = { key: 'b', severity: 'warning', message: 'Add a license.', entityId: '#a' }

async function render(issues: LiveIssue[]) {
  const { root, errors } = await mountApp(IssueMark, { props: { issues } })
  expect(errors).toEqual([])
  const label = element(root, (node) => node.tag === 'button').props['aria-label']
  const lines = nodes(root).filter((node) => node.tag === 'li').map((node) => content(node).trim())
  return { label, lines }
}

describe('IssueMark', () => {
  it('names a blocking issue as a requirement', async () => {
    const { label, lines } = await render([missing])

    expect(label).toBe('1 requirement missing')
    expect(lines).toEqual(['Requirement: Name is required.'])
  })

  it('names advisory issues as recommendations', async () => {
    const { label, lines } = await render([advised, { ...advised, key: 'c', message: 'Add keywords.' }])

    expect(label).toBe('2 recommendations open')
    expect(lines).toEqual(['Recommendation: Add a license.', 'Recommendation: Add keywords.'])
  })

  it('counts both kinds when they are mixed', async () => {
    const { label, lines } = await render([missing, advised])

    expect(label).toBe('1 requirement missing, 1 recommendation open')
    expect(lines).toEqual(['Requirement: Name is required.', 'Recommendation: Add a license.'])
  })
})
