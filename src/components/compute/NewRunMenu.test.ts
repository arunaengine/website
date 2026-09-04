import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  moduleDefault,
  mountApp,
  nodes,
} from '@/test/clientRender'

const push = vi.fn()
const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const NewRunMenu = compileClientComponent(new URL('./NewRunMenu.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push }) },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(ButtonStub),
})

describe('new run menu', () => {
  beforeEach(() => push.mockClear())

  it('opens the run page on the template that was picked', async () => {
    const mounted = await mountApp(NewRunMenu)

    expect(content(mounted.root)).toContain('New run')
    const entries = ['Python script', 'JavaScript script', 'Bash script', 'Blank run']
    for (const entry of entries) expect(content(mounted.root)).toContain(entry)
    expect(
      nodes(mounted.root).filter(
        (node) => node.tag === 'button' && entries.some((entry) => content(node).trim().startsWith(entry)),
      ),
    ).toHaveLength(4)

    await click(button(mounted.root, 'Python script'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-new', query: { template: 'python' } })

    await click(button(mounted.root, 'Bash script'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-new', query: { template: 'bash' } })

    // A blank run carries no template, so the page opens on a custom image.
    await click(button(mounted.root, 'Blank run'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-new' })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
