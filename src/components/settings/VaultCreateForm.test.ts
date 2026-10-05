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

const create = vi.fn(async (_passphrase: string, withRecovery: boolean) => (withRecovery ? 'ABCD-EFGH' : null))
const done = vi.fn()

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
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
const NoticeStub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, [attrs.title as string, slots.default?.()]))

const VaultCreateForm = compileClientComponent(new URL('./VaultCreateForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/composables/useUserVault': { useUserVault: () => ({ create }) },
  '@/lib/vault/crypto': { MIN_KEY_HOLDER_PASSPHRASE_LENGTH: 12 },
  '@/lib/utils': { errorMessage },
})

const Host = defineComponent(() => () => h(VaultCreateForm, { onDone: done }))

function field(root: Parameters<typeof content>[0], id: string) {
  return element(root, (node) => node.tag === 'input' && node.props.id === id)
}

async function fill(root: Parameters<typeof content>[0], passphrase: string, repeat = passphrase) {
  await typeValue(field(root, 'vault-passphrase'), passphrase)
  await typeValue(field(root, 'vault-repeat'), repeat)
}

beforeEach(() => {
  create.mockClear()
  done.mockClear()
  create.mockImplementation(async (_passphrase, withRecovery) => (withRecovery ? 'ABCD-EFGH' : null))
})

describe('VaultCreateForm', () => {
  it('needs a long enough passphrase typed twice', async () => {
    const { root } = await mountApp(Host)
    await fill(root, 'short', 'short')
    expect(button(root, 'Create').props.disabled).toBe(true)

    await fill(root, 'eleven char')
    expect(button(root, 'Create').props.disabled).toBe(true)

    await fill(root, 'correct horse', 'correct house')
    expect(button(root, 'Create').props.disabled).toBe(true)

    await fill(root, 'correct horse')
    expect(button(root, 'Create').props.disabled).toBe(false)
  })

  it('leaves the recovery code to the vault and finishes once the keys are set up', async () => {
    const { root } = await mountApp(Host)
    await fill(root, 'correct horse')
    await click(button(root, 'Create'))

    expect(create).toHaveBeenCalledWith('correct horse', true)
    expect(content(root)).not.toContain('ABCD-EFGH')
    expect(done).toHaveBeenCalledOnce()
  })

  it('creates no recovery code when none was asked for', async () => {
    const { root } = await mountApp(Host)
    await click(element(root, (node) => node.tag === 'input' && node.props.type === 'checkbox'))
    await fill(root, 'correct horse')
    await click(button(root, 'Create'))

    expect(create).toHaveBeenCalledWith('correct horse', false)
    expect(done).toHaveBeenCalledOnce()
  })

  it('shows why the keys could not be set up', async () => {
    create.mockRejectedValueOnce(new Error('The node is offline.'))
    const { root } = await mountApp(Host)
    await fill(root, 'correct horse')
    await click(button(root, 'Create'))

    expect(content(root)).toContain('The node is offline.')
    expect(done).not.toHaveBeenCalled()
  })
})
