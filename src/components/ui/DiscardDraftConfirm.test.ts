import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  compileClientComponent, element, flush, mountApp, nodes, teleportBody, type HostNode,
} from '@/test/clientRender'

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const FocusScopeStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { slots }) => () => slots.default?.(),
})
const bodyLocked = ref(false)

const Confirm = compileClientComponent(new URL('./DiscardDraftConfirm.vue', import.meta.url), {
  vue: VueRuntime,
  'radix-vue': { FocusScope: FocusScopeStub, useBodyScrollLock: () => bodyLocked },
  '@/components/ui/Button.vue': { __esModule: true, default: ButtonStub },
})

function overlay(): HostNode | undefined {
  return nodes(teleportBody).find((node) => node.props.role === 'alertdialog')?.parent ?? undefined
}

async function mount() {
  bodyLocked.value = false
  const open = ref(false)
  const host = defineComponent(() => () => h(Confirm, { open: open.value }))
  const { root, errors } = await mountApp(host)
  expect(errors).toEqual([])
  // The anchor stands in for the real element; the dialog it finds is a fake.
  const dialog = { style: new Map<string, string>() }
  Object.assign(element(root, (node) => node.tag === 'span'), {
    closest: (query: string) => (query === '[role="dialog"]' ? {
      style: {
        setProperty: (key: string, value: string) => dialog.style.set(key, value),
        removeProperty: (key: string) => dialog.style.delete(key),
      },
    } : null),
  })
  return { root, open, dialog }
}

describe('DiscardDraftConfirm', () => {
  it('renders in the body, fixed to the viewport, above the dialog', async () => {
    const { root, open } = await mount()
    open.value = true
    await flush()

    const classes = String(overlay()?.props.class ?? '')
    expect(classes).toContain('fixed inset-0')
    expect(classes).toContain('z-[var(--z-modal)]')
    expect(classes).toContain('pointer-events-auto')
    expect(overlay()?.props['data-portal-list']).toBe('')
    expect(nodes(root).some((node) => node.props.role === 'alertdialog')).toBe(false)
  })

  it('locks the page and the dialog scroll area only while open', async () => {
    const { open, dialog } = await mount()
    expect(bodyLocked.value).toBe(false)

    open.value = true
    await flush()
    expect(bodyLocked.value).toBe(true)
    expect(dialog.style.get('overflow')).toBe('hidden')

    open.value = false
    await flush()
    expect(bodyLocked.value).toBe(false)
    expect(dialog.style.has('overflow')).toBe(false)
  })
})
