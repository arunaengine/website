import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'
import type { VaultState } from '@/composables/useUserVault'

const state = ref<VaultState>('absent')
const loaded = ref(true)
const error = ref<string | null>(null)

const CreateStub = defineComponent(() => () => h('div', { 'data-create': '' }))
const UnlockStub = defineComponent(() => () => h('div', { 'data-unlock': '' }))

const VaultGate = compileClientComponent(new URL('./VaultGate.vue', import.meta.url), {
  vue: VueRuntime,
  './VaultCreateForm.vue': moduleDefault(CreateStub),
  './VaultUnlockForm.vue': moduleDefault(UnlockStub),
  '@/composables/useUserVault': { useUserVault: () => ({ state, loaded, error }) },
})

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

  it('asks for the passphrase while the keys are locked', async () => {
    state.value = 'locked'
    const { root } = await mountApp(VaultGate)

    expect(has(root, 'data-unlock')).toBe(true)
    expect(has(root, 'data-create')).toBe(false)
  })
})
