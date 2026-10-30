import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'
import * as Utils from '@/lib/utils'

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const OptionToggle = compileClientComponent(new URL('../ui/OptionToggle.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/lib/utils': Utils,
})
const icon = (name: string) => defineComponent(() => () => h('i', { 'data-icon': name }))
const toggle = compileClientComponent(new URL('./DashboardScopeToggle.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': { Users: icon('users'), Globe: icon('globe') },
  '@/components/ui/OptionToggle.vue': moduleDefault(OptionToggle),
})

describe('dashboard scope toggle', () => {
  it('presses the shown scope and offers the other without a caption', async () => {
    const { root } = await mountApp(toggle, { props: { modelValue: 'personal' } })

    expect(button(root, 'My groups').props['aria-pressed']).toBe(true)
    expect(button(root, 'Whole realm').props['aria-pressed']).toBe(false)
    expect(content(root)).not.toContain('Lead with')
    expect(button(root, 'My groups').children.some((child) => child.props?.['data-icon'] === 'users')).toBe(true)
    expect(button(root, 'Whole realm').children.some((child) => child.props?.['data-icon'] === 'globe')).toBe(true)
  })

  it('emits only a change of scope', async () => {
    const update = vi.fn()
    const { root } = await mountApp(toggle, { props: { modelValue: 'personal', 'onUpdate:modelValue': update } })

    await click(button(root, 'My groups'))
    expect(update).not.toHaveBeenCalled()

    await click(button(root, 'Whole realm'))
    expect(update).toHaveBeenCalledWith('realm')
  })

  it('puts the picked option on the card background in a muted track', async () => {
    const { root } = await mountApp(toggle, { props: { modelValue: 'personal' } })
    expect(String(button(root, 'My groups').props.class)).toContain('bg-card')
    expect(String(button(root, 'Whole realm').props.class)).toContain('text-muted-foreground')
    expect(String(button(root, 'My groups').parent!.props.class)).toContain('bg-muted')
  })
})
