import * as VueRuntime from 'vue'
import { defineComponent, h, ref, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import type { MergeStep, OtherAccount } from '@/composables/useAccountMerge'
import type { MergeAccountResponse, UserInfoResponse } from '@/lib/api'

const step = ref<MergeStep>('idle')
const failure = ref<string | null>(null)
const other = shallowRef<OtherAccount | null>(null)
const result = shallowRef<MergeAccountResponse | null>(null)
const actions = { start: vi.fn(), copyVault: vi.fn(), merge: vi.fn(), attach: vi.fn(), cancel: vi.fn() }
const age = ref(30)
const userInfo = ref<Partial<UserInfoResponse> | null>(null)

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Notice = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () => h('div', [props.title, slots.default?.()]),
})
const DetailList = defineComponent({
  props: { items: Array },
  setup: (props) => () => h('dl', (props.items as Array<{ label: string; value: string }>).map((item) => `${item.label}: ${item.value};`)),
})
const AccountMerge = compileClientComponent(new URL('./AccountMerge.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/DetailList.vue': moduleDefault(DetailList),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (props) => () => h('span', props.label) })),
  '@/composables/useAruna': { useAruna: () => ({ authToken: ref('t'), userInfo }) },
  '@/composables/useAccountMerge': {
    useAccountMerge: () => ({ step, failure, other, result, ...actions }),
    loginAge: () => age.value,
  },
  '@/lib/utils': { truncateMiddle: (value: string) => value },
})

function account(vault = false): OtherAccount {
  return {
    info: {
      user: { user_id: 'b1@R', name: 'Bob', subject_ids: ['s1', 's2'], attributes: {} },
      realm: { realm_id: 'R', roles: [] },
      groups: [{ group_id: 'g1', display_name: 'Lab', roles: [] }],
      preferences: { favourite_metadata_ids: [] },
    },
    devices: 1,
    vault: [],
    ownVault: vault,
  }
}

async function render() {
  const mounted = await mountApp(defineComponent({ setup: () => () => h(AccountMerge) }))
  await flush()
  return mounted
}

beforeEach(() => {
  step.value = 'idle'
  failure.value = null
  other.value = null
  result.value = null
  age.value = 30
  userInfo.value = null
  for (const action of Object.values(actions)) action.mockReset()
})

describe('adding another account', () => {
  it('starts the sign-in and lists merged accounts', async () => {
    userInfo.value = { merged_user_ids: ['b0@R'] }
    const { root, app } = await render()
    expect(content(root)).toContain('Merged accounts')
    expect(content(root)).toContain('b0@R')
    await click(button(root, 'Add account'))
    expect(actions.start).toHaveBeenCalledTimes(1)
    app.unmount()
  })

  it('lists what moves and what ends before the merge', async () => {
    step.value = 'confirm'
    other.value = account()
    const { root, app } = await render()
    const text = content(root)
    expect(text).toContain('Merge Bob into this account?')
    expect(text).toContain('Sign-ins: 2;')
    expect(text).toContain('Groups: 1;')
    expect(text).toContain('Devices: 1, they sign in again;')
    for (const ended of ['Its sessions', 'Its S3 keys', 'Its share links']) expect(text).toContain(ended)
    expect(text).not.toContain('You confirm with your own login first.')
    await click(button(root, 'Merge'))
    expect(actions.merge).toHaveBeenCalledTimes(1)
    app.unmount()
  })

  it('says when the merge asks for this login again', async () => {
    step.value = 'confirm'
    other.value = account()
    age.value = 400
    const { root, app } = await render()
    expect(content(root)).toContain('You confirm with your own login first.')
    app.unmount()
  })

  it('shows the result with what was not copied', async () => {
    step.value = 'merged'
    result.value = {
      user_id: 'a1@R', merged_user_id: 'b1@R', subjects: 2, groups: 1, realm_roles: 0, devices: 1,
      attributes: 3, attributes_not_copied: ['theme', 'orcid'], secondaries: 0, repeated: false,
    }
    const { root, app } = await render()
    const text = content(root)
    expect(text).toContain('Accounts merged')
    expect(text).toContain('Preferences copied: 3;')
    expect(text).toContain('theme, orcid')
    await click(button(root, 'Done'))
    expect(actions.cancel).toHaveBeenCalledTimes(1)
    app.unmount()
  })

  it('offers to attach a sign-in without an account', async () => {
    step.value = 'unregistered'
    const { root, app } = await render()
    expect(content(root)).toContain('This sign-in has no account yet.')
    await click(button(root, 'Attach sign-in'))
    expect(actions.attach).toHaveBeenCalledTimes(1)
    app.unmount()
  })

  it('offers to copy the vault, and stops when both have one', async () => {
    step.value = 'copy-vault'
    other.value = account()
    const { root, app } = await render()
    expect(content(root)).toContain('Bob has a vault with keys.')
    await click(button(root, 'Copy vault'))
    expect(actions.copyVault).toHaveBeenCalledTimes(1)

    step.value = 'vault-blocked'
    other.value = account(true)
    await flush()
    expect(content(root)).toContain('Both accounts have a vault.')
    expect(() => button(root, 'Merge')).toThrow()
    app.unmount()
  })

  it('keeps a failure on screen after the flow ended', async () => {
    failure.value = 'The browser blocked the sign-in window. Allow popups for this site.'
    const { root, app } = await render()
    expect(content(root)).toContain('The browser blocked the sign-in window.')
    await click(button(root, 'Close'))
    expect(actions.cancel).toHaveBeenCalledTimes(1)
    app.unmount()
  })
})
