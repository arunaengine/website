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
const toggle = compileClientComponent(new URL('./DashboardScopeToggle.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/OptionToggle.vue': moduleDefault(OptionToggle),
})

describe('dashboard scope toggle', () => {
  it('presses the shown scope and offers the other without a caption', async () => {
    const { root } = await mountApp(toggle, { props: { modelValue: 'personal' } })

    expect(button(root, 'My statistics').props['aria-pressed']).toBe(true)
    expect(button(root, 'Realm statistics').props['aria-pressed']).toBe(false)
    expect(content(root)).not.toContain('Lead with')
  })

  it('emits only a change of scope', async () => {
    const update = vi.fn()
    const { root } = await mountApp(toggle, { props: { modelValue: 'personal', 'onUpdate:modelValue': update } })

    await click(button(root, 'My statistics'))
    expect(update).not.toHaveBeenCalled()

    await click(button(root, 'Realm statistics'))
    expect(update).toHaveBeenCalledWith('realm')
  })
})
