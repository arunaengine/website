import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
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
import { errorMessage } from '@/lib/utils'

const unlock = vi.fn(async (_passphrase: string) => {})
const unlockWithRecovery = vi.fn(async (_code: string) => {})
const done = vi.fn()

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, id: String, type: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('input', {
      id: props.id,
      type: props.type,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})
const NoticeStub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))

const VaultUnlockForm = compileClientComponent(new URL('./VaultUnlockForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/composables/useUserVault': { useUserVault: () => ({ unlock, unlockWithRecovery }) },
  '@/lib/utils': { errorMessage },
})

const Host = defineComponent(() => () => h(VaultUnlockForm, { onDone: done }))

function secret(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'input' && node.props.id === 'vault-secret')
}

beforeEach(() => {
  unlock.mockClear()
  unlockWithRecovery.mockClear()
  done.mockClear()
})

describe('VaultUnlockForm', () => {
  it('unlocks with the passphrase and reports a wrong one', async () => {
    unlock.mockRejectedValueOnce(new Error('Wrong passphrase.'))
    const { root } = await mountApp(Host)
    expect(button(root, 'Unlock').props.disabled).toBe(true)
    expect(secret(root).props.type).toBe('password')

    await typeValue(secret(root), 'wrong horse')
    await click(button(root, 'Unlock'))
    expect(content(root)).toContain('Wrong passphrase.')
    expect(done).not.toHaveBeenCalled()

    await typeValue(secret(root), 'correct horse')
    await click(button(root, 'Unlock'))
    expect(unlock).toHaveBeenLastCalledWith('correct horse')
    expect(done).toHaveBeenCalledOnce()
  })

  it('takes the recovery code instead when asked', async () => {
    const { root } = await mountApp(Host)
    await click(button(root, 'Use the recovery code'))
    expect(content(root)).toContain('Recovery code')
    expect(secret(root).props.type).toBe('text')

    await typeValue(secret(root), 'abcd-efgh')
    await click(button(root, 'Unlock'))

    expect(unlockWithRecovery).toHaveBeenCalledWith('abcd-efgh')
    expect(unlock).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledOnce()
  })
})
