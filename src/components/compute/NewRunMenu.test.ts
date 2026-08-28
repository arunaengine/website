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

  it('shows both run modes and routes to each wizard', async () => {
    const mounted = await mountApp(NewRunMenu)

    expect(content(mounted.root)).toContain('New run')
    expect(content(mounted.root)).toContain('Quick run')
    expect(content(mounted.root)).toContain('Custom run')
    expect(
      nodes(mounted.root).filter(
        (node) =>
          node.tag === 'button' &&
          (content(node).trim().startsWith('Quick run') || content(node).trim().startsWith('Custom run')),
      ),
    ).toHaveLength(2)

    await click(button(mounted.root, 'Quick run'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-quick' })

    await click(button(mounted.root, 'Custom run'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-new' })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
