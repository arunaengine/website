import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import type { VaultState } from '@/composables/useUserVault'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  mountApp,
  moduleDefault,
} from '@/test/clientRender'

const vaultState = ref<VaultState>('unlocked')
const vaultLoaded = ref(true)
const loadVault = vi.fn()
const unlock = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const NoticeStub = defineComponent({
  props: { title: String, lines: Array },
  setup: (props, { slots }) => () =>
    h('aside', [props.title, slots.default?.(), ...((props.lines as string[] | undefined) ?? []).map((line) => h('p', line))]),
})
const SelectStub = defineComponent({
  inheritAttrs: false,
  props: { options: Array, modelValue: String },
  setup: (props, { attrs }) => () =>
    h('select', attrs, (props.options as { label: string }[]).map((option) => h('option', option.label))),
})

const dialog = compileClientComponent(new URL('./BucketUnlockDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slotted('a') },
  '@/components/settings/VaultUnlockForm.vue': moduleDefault(defineComponent(() => () => h('form', 'passphrase form'))),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/composables/useUserVault': {
    useUserVault: () => ({ state: vaultState, loaded: vaultLoaded, error: ref(null), load: loadVault }),
  },
  '@/lib/bucketEncryption': Wording,
})

async function render(maxUnlockMs: number | null = null, role = 'active') {
  const props = { open: true, bucket: 'reef', generation: 2, role, maxUnlockMs, unlock }
  const { root } = await mountApp(dialog, { props })
  return root
}

beforeEach(() => {
  vaultState.value = 'unlocked'
  vaultLoaded.value = true
  loadVault.mockReset()
  unlock.mockReset().mockResolvedValue({ kind: 'unlocked', status: {}, ownKey: 'matches' })
})

describe('bucket unlock dialog', () => {
  it('sends the chosen length within the bucket maximum', async () => {
    const root = await render(8 * 3_600_000)
    const select = element(root, (node) => node.tag === 'select')

    expect(content(select)).toBe('The bucket maximum (8 hours)15 minutes1 hour')
    ;(select.props['onUpdate:modelValue'] as (value: string) => void)('3600000')
    await flush()
    await click(button(root, 'Unlock'))

    expect(unlock).toHaveBeenCalledWith(2, 3_600_000)
    expect(content(root)).toContain('The node confirmed the unlock.')
  })

  it('leaves the length to the node when none is chosen and warns about the shared disk', async () => {
    const root = await render()

    expect(content(root)).toContain('share one disk')
    await click(button(root, 'Unlock'))

    expect(unlock).toHaveBeenCalledWith(2, undefined)
  })

  it('names the previous key it unlocks', async () => {
    expect(content(await render(null, 'source'))).toContain('It is the previous key')
  })

  it('asks for the passphrase first, or points to the vault setup', async () => {
    vaultState.value = 'locked'
    const locked = await render()
    expect(content(locked)).toContain('passphrase form')
    expect(content(locked)).not.toContain('Unlocking')

    vaultState.value = 'absent'
    expect(content(await render())).toContain('Set one up in Settings')

    vaultLoaded.value = false
    await render()
    expect(loadVault).toHaveBeenCalled()
  })

  it('says when the node did not confirm, and when the directory key is not this vault', async () => {
    unlock.mockResolvedValueOnce({ kind: 'unknown', ownKey: 'mismatch' })
    const root = await render()

    await click(button(root, 'Unlock'))

    expect(content(root)).toContain('The node did not confirm the unlock')
    expect(content(root)).toContain('names a key that is not in this vault')
    expect(content(root)).not.toContain('confirmed the unlock.')
  })

  it('words a refusal from the node', async () => {
    unlock.mockRejectedValueOnce(new Api.ApiError(400, 'bad', 'wrong_key'))
    const root = await render()

    await click(button(root, 'Unlock'))

    expect(content(root)).toContain('this key does not belong to the bucket')
  })
})
