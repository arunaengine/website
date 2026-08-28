import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)

const IssueDrawer = compileClientComponent(new URL('./IssueDrawer.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/lib/crate/editor': Editor,
})

function seeded() {
  const named = Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
  return Editor.addEntity(named, { type: 'Person', id: '#nobody' }).draft
}

function mount(draft: Editor.CrateDraft, jumps: string[] = []) {
  return mountApp(IssueDrawer, {
    props: { draft, issues: Editor.liveIssues(draft), onJump: (id: string) => jumps.push(id) },
  })
}

describe('IssueDrawer', () => {
  it('counts the problems without listing them', async () => {
    const mounted = await mount(seeded())
    const text = content(mounted.root)

    expect(text).toContain('problems')
    expect(text).not.toContain('has no name')
    mounted.app.unmount()
  })

  it('expands into the problems grouped per entity', async () => {
    const jumps: string[] = []
    const mounted = await mount(seeded(), jumps)

    await click(element(mounted.root, (node) => node.props['aria-expanded'] !== undefined))
    expect(content(mounted.root)).toContain('#nobody has no name.')
    expect(content(mounted.root)).toContain('Example dataset')

    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).trim() === 'Open'))
    expect(jumps).toHaveLength(1)
    mounted.app.unmount()
  })

  it('says so when a dataset has nothing outstanding', async () => {
    const complete = Editor.updateValue(
      Editor.updateValue(
        Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset'),
        './', 'description', 0, 'What it holds.',
      ),
      './', 'license', 0, 'https://creativecommons.org/licenses/by/4.0/',
    )
    const mounted = await mount(complete)

    expect(content(mounted.root)).toContain('Nothing outstanding')
    mounted.app.unmount()
  })
})
