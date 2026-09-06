import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import type { VaultState } from '@/composables/useUserVault'
import { errorMessage } from '@/lib/utils'

const state = ref<VaultState>('unlocked')
const error = ref<string | null>(null)
const lock = vi.fn()
const changePassphrase = vi.fn(async (_secret: unknown, _next: string) => {})
const reset = vi.fn(async () => {})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', { 'data-dialog': '' }, slots.default?.()) : null),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, id: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('input', {
      id: props.id,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})
const UnlockStub = defineComponent(() => () => h('div', { 'data-unlock': '' }))
const CreateStub = defineComponent(() => () => h('div', { 'data-create': '' }))

const VaultSettings = compileClientComponent(new URL('./VaultSettings.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  './VaultUnlockForm.vue': moduleDefault(UnlockStub),
  './VaultCreateForm.vue': moduleDefault(CreateStub),
  '@/composables/useUserVault': { useUserVault: () => ({ state, error, lock, changePassphrase, reset }) },
  '@/lib/vault/crypto': { MIN_PASSPHRASE_LENGTH: 8 },
  '@/lib/utils': { errorMessage },
})

function field(root: Parameters<typeof content>[0], id: string) {
  return element(root, (node) => node.tag === 'input' && node.props.id === id)
}

function dialog(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['data-dialog'] !== undefined)
}

beforeEach(() => {
  state.value = 'unlocked'
  error.value = null
  lock.mockClear()
  changePassphrase.mockClear()
  reset.mockClear()
})

describe('VaultSettings', () => {
  it('offers to choose a passphrase for a user who has no keys on the node', async () => {
    state.value = 'absent'
    const { root } = await mountApp(VaultSettings)

    expect(content(root)).toContain('Choose a passphrase to start.')
    expect(element(root, (node) => node.props['data-create'] !== undefined)).toBeDefined()
    expect(() => button(root, 'Lock')).toThrow()
  })

  it('says when the node cannot keep keys', async () => {
    state.value = 'unsupported'
    const { root } = await mountApp(VaultSettings)

    expect(content(root)).toContain('This node cannot keep provider keys.')
  })

  it('asks for the passphrase while the keys are locked', async () => {
    state.value = 'locked'
    const { root } = await mountApp(VaultSettings)

    expect(content(root)).toContain('sealed with your passphrase')
    expect(element(root, (node) => node.props['data-unlock'] !== undefined)).toBeDefined()
    expect(() => button(root, 'Lock')).toThrow()
  })

  it('locks the keys from the unlocked view', async () => {
    const { root } = await mountApp(VaultSettings)
    expect(content(root)).toContain('Unlocked')

    await click(button(root, 'Lock'))

    expect(lock).toHaveBeenCalledOnce()
  })

  it('changes the passphrase after the new one is typed twice', async () => {
    const { root } = await mountApp(VaultSettings)
    await click(button(root, 'Change passphrase'))
    const box = dialog(root)

    await typeValue(field(box, 'vault-current'), 'old horse')
    await typeValue(field(box, 'vault-next'), 'new horse!')
    expect(button(box, 'Change passphrase').props.disabled).toBe(true)
    await typeValue(field(box, 'vault-next-repeat'), 'new horse!')
    await click(button(box, 'Change passphrase'))

    expect(changePassphrase).toHaveBeenCalledWith({ passphrase: 'old horse' }, 'new horse!')
    expect(() => dialog(root)).toThrow()
  })

  it('takes the recovery code in place of a forgotten passphrase', async () => {
    const { root } = await mountApp(VaultSettings)
    await click(button(root, 'Change passphrase'))
    await click(button(dialog(root), 'Use the recovery code'))

    await typeValue(field(dialog(root), 'vault-current'), 'ABCD-EFGH')
    await typeValue(field(dialog(root), 'vault-next'), 'new horse!')
    await typeValue(field(dialog(root), 'vault-next-repeat'), 'new horse!')
    await click(button(dialog(root), 'Change passphrase'))

    expect(changePassphrase).toHaveBeenCalledWith({ recoveryCode: 'ABCD-EFGH' }, 'new horse!')
  })

  it('names what a reset loses before deleting the keys', async () => {
    const { root } = await mountApp(VaultSettings)
    await click(button(root, 'Reset'))

    expect(reset).not.toHaveBeenCalled()
    const text = content(dialog(root))
    expect(text).toContain('Every provider key kept there is lost')
    expect(text).toContain('recovery code stops working')

    await click(element(dialog(root), (node) => node.tag === 'button' && node.props.variant === 'destructive'))

    expect(reset).toHaveBeenCalledOnce()
    expect(() => dialog(root)).toThrow()
  })

  it('shows why the keys could not be read', async () => {
    state.value = 'absent'
    error.value = 'The node is offline.'
    const { root } = await mountApp(VaultSettings)

    expect(content(root)).toContain('could not be read: The node is offline.')
  })
})
