import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { click, compileClientComponent, content, element, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const Slotted = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Breadcrumbs = compileClientComponent(new URL('./Breadcrumbs.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Slotted('menu')),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(Slotted('li')),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Slotted('span')),
})

async function mount(path: string, icon?: unknown) {
  const opened = ref<string[]>([])
  const mounted = await mountApp(defineComponent(() => () => h(Breadcrumbs, { bucket: 'laptop', path, icon, onNavigate: (to: string) => opened.value.push(to) })))
  if (mounted.errors.length) throw mounted.errors[0]
  return { root: mounted.root, opened }
}

describe('breadcrumbs', () => {
  it('shows the parent and the open folder of a deep path, the rest in the … menu', async () => {
    const { root, opened } = await mount('results/runs/bakta/final')
    const nav = element(root, (node) => node.tag === 'nav')
    const shown = nodes(nav).filter((node) => node.tag === 'button' || node.props['aria-current'] === 'page').map((node) => content(node).trim())
    expect(shown).toEqual(['laptop', '…', 'bakta', 'final'])
    const menu = element(root, (node) => node.tag === 'menu')
    expect(nodes(menu).filter((node) => node.tag === 'li').map((node) => content(node).trim())).toEqual(['results', 'runs'])

    await click(element(menu, (node) => node.tag === 'li' && content(node).includes('runs')))
    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'bakta'))
    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'laptop'))
    expect(opened.value).toEqual(['results/runs', 'results/runs/bakta', ''])
  })

  it('names a short path in full, with the open folder as plain text', async () => {
    const { root } = await mount('bakta/final')
    expect(nodes(root).some((node) => node.tag === 'menu')).toBe(false)
    expect(content(root).replace(/\s+/g, '')).toBe('laptop/bakta/final')
    expect(element(root, (node) => node.props['aria-current'] === 'page').tag).toBe('span')
  })

  it('starts with the bucket\'s own icon', async () => {
    const { root } = await mount('', defineComponent(() => () => h('i', 'bucket icon')))
    expect(content(element(root, (node) => node.tag === 'button'))).toContain('bucket icon')
  })
})
