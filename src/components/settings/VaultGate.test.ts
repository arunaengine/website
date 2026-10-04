import * as VueRuntime from 'vue'
import { defineComponent, h, ref, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import type { VaultState } from '@/composables/useUserVault'

const state = ref<VaultState>('absent')
const loaded = ref(true)
const error = ref<string | null>(null)
const recoveryCode = ref<string | null>(null)
const dismissRecovery = vi.fn(() => {
  recoveryCode.value = null
})
const vault = { state, loaded, error, recoveryCode, dismissRecovery }
const done = vi.fn()

const CreateStub = defineComponent(() => () => h('div', { 'data-create': '' }))
const UnlockStub = defineComponent(() => () => h('div', { 'data-unlock': '' }))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const VaultRecoveryCode = compileClientComponent(new URL('./VaultRecoveryCode.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/CopyButton.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('div')),
  '@/composables/useUserVault': { useUserVault: () => vault },
})

const VaultGate = compileClientComponent(new URL('./VaultGate.vue', import.meta.url), {
  vue: VueRuntime,
  './VaultCreateForm.vue': moduleDefault(CreateStub),
  './VaultRecoveryCode.vue': moduleDefault(VaultRecoveryCode),
  './VaultUnlockForm.vue': moduleDefault(UnlockStub),
  '@/composables/useUserVault': { useUserVault: () => vault },
})
const Host = defineComponent(() => () => h(VaultGate, { onDone: done }))
const hosts: App[] = []

async function mountHost() {
  const mounted = await mountApp(Host)
  hosts.push(mounted.app as App)
  return mounted
}

function has(root: Parameters<typeof content>[0], attribute: string): boolean {
  try {
    element(root, (node) => node.props[attribute] !== undefined)
    return true
  } catch {
    return false
  }
}

beforeEach(() => {
  state.value = 'absent'
  loaded.value = true
  error.value = null
  recoveryCode.value = null
  dismissRecovery.mockClear()
  done.mockClear()
})

afterEach(() => {
  hosts.splice(0).forEach((app) => app.unmount())
})

describe('VaultGate', () => {
  it('offers to create a passphrase only once the node answered', async () => {
    loaded.value = false
    const early = await mountApp(VaultGate)
    expect(has(early.root, 'data-create')).toBe(false)

    loaded.value = true
    const ready = await mountApp(VaultGate)
    expect(has(ready.root, 'data-create')).toBe(true)
  })

  it('never offers to create over keys it could not read', async () => {
    error.value = 'The node is offline.'
    const { root } = await mountApp(VaultGate)

    expect(has(root, 'data-create')).toBe(false)
    expect(content(root)).toContain('could not be read: The node is offline.')
  })

  it('shows the recovery code of the new keys and is passed only once it was stored', async () => {
    const { root } = await mountHost()
    expect(has(root, 'data-create')).toBe(true)

    state.value = 'unlocked'
    recoveryCode.value = 'ABCD-EFGH'
    await flush()

    expect(has(root, 'data-create')).toBe(false)
    expect(content(root)).toContain('ABCD-EFGH')
    expect(content(root)).toContain('Keep it somewhere safe')
    expect(done).not.toHaveBeenCalled()

    await click(button(root, 'I stored it'))
    expect(dismissRecovery).toHaveBeenCalledOnce()
    expect(content(root)).not.toContain('ABCD-EFGH')
    expect(done).toHaveBeenCalledOnce()
  })

  it('is passed once the keys unlock', async () => {
    state.value = 'locked'
    await mountHost()

    state.value = 'unlocked'
    await flush()

    expect(done).toHaveBeenCalledOnce()
  })

  it('asks for the passphrase while the keys are locked', async () => {
    state.value = 'locked'
    const { root } = await mountApp(VaultGate)

    expect(has(root, 'data-unlock')).toBe(true)
    expect(has(root, 'data-create')).toBe(false)
  })
})
