import * as VueRuntime from 'vue'
import { defineComponent, h, ref, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import type { MergeStep, OtherAccount } from '@/composables/useAccountMerge'
import type { MergeAccountResponse, UserInfoResponse } from '@/lib/api'
import { DEFAULT_PORTAL_CONFIG, type LoginOption, type PortalRuntimeConfig } from '@/lib/config'

const step = ref<MergeStep>('idle')
const failure = ref<string | null>(null)
const other = shallowRef<OtherAccount | null>(null)
const result = shallowRef<MergeAccountResponse | null>(null)
const actions = { choose: vi.fn(), start: vi.fn(), copyVault: vi.fn(), merge: vi.fn(), attach: vi.fn(), cancel: vi.fn() }
const GFBIO: LoginOption = { name: 'GFBio SSO', description: '', logo: '', params: {}, linkParams: {}, upstream: { provider: 'gfbio', bridge: 'https://bridge.test/gfbio' } }
const LEGACY: LoginOption = { name: 'Aruna (legacy)', description: '', logo: '', params: {}, linkParams: {} }
const LOGINS: PortalRuntimeConfig = { ...DEFAULT_PORTAL_CONFIG, login: { options: [GFBIO, LEGACY], accountUrl: '' } }
let config: PortalRuntimeConfig = DEFAULT_PORTAL_CONFIG
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
const LoginOptions = compileClientComponent(new URL('./LoginOptions.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/auth/ProviderLogo.vue': moduleDefault(defineComponent(() => () => null)),
  '@/lib/config': { portalConfig: () => config },
})
const AccountMerge = compileClientComponent(new URL('./AccountMerge.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/auth/LoginOptions.vue': moduleDefault(LoginOptions),
  '@/lib/config': { portalConfig: () => config },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/IconTile.vue': moduleDefault(defineComponent(() => () => null)),
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
    loginFresh: () => age.value <= 240,
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
  config = DEFAULT_PORTAL_CONFIG
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

  it('asks for the login of the other account when logins are configured', async () => {
    config = LOGINS
    const { root, app } = await render()
    await click(button(root, 'Add account'))
    expect(actions.choose).toHaveBeenCalledTimes(1)
    expect(actions.start).not.toHaveBeenCalled()
    step.value = 'choose'
    await flush()
    expect(content(root)).toContain('Choose how you sign in with the other account.')
    await click(button(root, 'GFBio SSO'))
    expect(actions.start).toHaveBeenCalledWith(GFBIO)
    await click(button(root, 'Aruna (legacy)'))
    expect(actions.start).toHaveBeenLastCalledWith(LEGACY)
    app.unmount()
  })

  it('confirms an old own login through the chosen login', async () => {
    config = LOGINS
    step.value = 'confirm'
    other.value = account()
    age.value = 400
    const { root, app } = await render()
    expect(content(root)).toContain('You confirm with your own login first.')
    expect(() => button(root, 'Merge')).toThrow()
    await click(button(root, 'GFBio SSO'))
    expect(actions.merge).toHaveBeenCalledWith(GFBIO)
    step.value = 'unregistered'
    await flush()
    expect(() => button(root, 'Attach sign-in')).toThrow()
    await click(button(root, 'Aruna (legacy)'))
    expect(actions.attach).toHaveBeenCalledWith(LEGACY)
    app.unmount()
  })

  it('names merged accounts and falls back to the short id', async () => {
    userInfo.value = {
      merged_user_ids: ['b0@R', 'c0@R'],
      merged_users: [{ user_id: 'b0@R', name: 'Bob' }, { user_id: 'c0@R', name: null }],
    }
    const { root, app } = await render()
    const text = content(root)
    expect(text).toContain('Bob')
    expect(text).not.toContain('b0@R')
    expect(text).toContain('c0@R')
    app.unmount()
  })

  it('lists what moves and what ends before the merge', async () => {
    step.value = 'confirm'
    other.value = account()
    const { root, app } = await render()
    const text = content(root)
    expect(text).toContain('Merge Bob into this account?')
    expect(text).toContain('Sign-ins2')
    expect(text).toContain('Groups1')
    expect(text).toContain('Devices1, they sign in again')
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
    expect(text).toContain('Preferences copied3')
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
