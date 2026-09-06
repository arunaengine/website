import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import type { AssistantProvider } from '@/lib/api'

const loadModels = vi.fn()
const send = vi.fn()
const confirmSwitch = vi.fn()
const keepCurrent = vi.fn()

const openai: AssistantProvider = {
  provider_id: 'browser-1',
  kind: 'openai_compatible',
  label: 'OpenAI',
  models: [{ id: 'gpt-5.6-sol' }],
  default_model: 'gpt-5.6-sol',
  status: 'ready',
  created_at: '2026-08-01T00:00:00Z',
}

const page = { kind: 'dataset', title: 'Water quality', details: { 'document id': '01H' } }

const aruna = {
  currentUser: ref<{ name: string; id?: string } | null>(null),
  profiles: ref<Array<{ id: string; name: string }>>([]),
  myGroups: ref<unknown[]>([]),
  discoverableGroups: ref<unknown[]>([]),
  realmInfo: ref<{ nodes: Array<{ kind: string; present: boolean }> } | null>(null),
  usageInfo: ref<{ metadata_documents?: number; objects?: number; buckets?: number; stored_bytes?: number } | null>(null),
}

const vaultState = ref<'absent' | 'locked' | 'unlocked' | 'unsupported'>('absent')

const chat = {
  busy: ref(false),
  draft: ref(''),
  toolsNote: ref<string | null>(null),
  provider: ref<AssistantProvider | null>(openai),
  providerId: ref('browser-1'),
  model: ref('gpt-5.6-sol'),
  historyReady: ref(true),
  loadModels,
  send,
  removed: ref<{ id: string; label: string } | null>(null),
  switchNotice: ref<{ providerId: string; providerLabel: string; model: string; messages: number; kiloChars: number } | null>(null),
  confirmSwitch,
  keepCurrent,
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const NoticeStub = defineComponent((_, { slots }) => () => h('div', { 'data-notice': '' }, slots.default?.()))
const SettingsStub = defineComponent((_, { slots }) => () => h('div', { 'data-settings': '' }, slots.default?.()))
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', { 'data-dialog': '' }, slots.default?.()) : null),
})
const UnlockStub = defineComponent(() => () => h('div', { 'data-unlock': '' }))
const TextareaStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('textarea', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const LinkStub = defineComponent({
  props: { to: { type: Object, default: () => ({}) } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})

const ChatComposer = compileClientComponent(new URL('./ChatComposer.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRoute: () => ({ fullPath: '/app/assistant' }), RouterLink: LinkStub },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Textarea.vue': moduleDefault(TextareaStub),
  '@/components/assistant/AssistantSettings.vue': moduleDefault(SettingsStub),
  '@/components/settings/VaultUnlockForm.vue': moduleDefault(UnlockStub),
  '@/composables/useUserVault': { useUserVault: () => ({ state: vaultState }) },
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useRealm': { useRealm: () => ({ realmId: ref('r-1') }) },
  '@/composables/useGroupSelection': { activeGroupId: ref('') },
  '@/composables/useAssistantChat': { useAssistantChat: () => chat },
  '@/composables/useAssistantRunForm': { useAssistantRunForm: () => ({ bridge: { value: null } }) },
  '@/composables/useAssistantProfileForm': { useAssistantProfileForm: () => ({ bridge: { value: null } }) },
  '@/composables/useAssistantEditor': { useAssistantEditor: () => ({ bridge: ref(null) }) },
  '@/composables/usePageContext': { usePageContext: () => ({ currentPage: () => page }) },
})

function control(root: Parameters<typeof content>[0], label: string) {
  return element(root, (node) => node.props['aria-label'] === label)
}

beforeEach(() => {
  loadModels.mockClear()
  send.mockClear()
  chat.draft.value = ''
  chat.toolsNote.value = null
  chat.busy.value = false
  chat.provider.value = openai
  chat.providerId.value = 'browser-1'
  chat.removed.value = null
  chat.switchNotice.value = null
  confirmSwitch.mockClear()
  keepCurrent.mockClear()
  vaultState.value = 'absent'
  aruna.currentUser.value = null
  aruna.profiles.value = []
  aruna.myGroups.value = []
  aruna.discoverableGroups.value = []
  aruna.realmInfo.value = null
  aruna.usageInfo.value = null
})

describe('ChatComposer', () => {
  it('sends only once a message is typed', async () => {
    const { root } = await mountApp(ChatComposer, { props: { size: 'full' } })
    expect(control(root, 'Send').props.disabled).toBe(true)

    await typeValue(control(root, 'Message'), 'hi')
    await click(control(root, 'Send'))

    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0]).toBe('hi')
    expect(send.mock.calls[0][1].page).toBe(page)
    expect(chat.draft.value).toBe('')
  })

  it('keeps the shared draft while a turn is running', async () => {
    chat.busy.value = true
    chat.draft.value = 'half a question'
    const { root } = await mountApp(ChatComposer)

    expect(control(root, 'Message').props.value).toBe('half a question')
    await click(control(root, 'Send'))

    expect(send).not.toHaveBeenCalled()
  })

  it('asks for the model list when the cogwheel opens the settings', async () => {
    const { root } = await mountApp(ChatComposer)
    await click(control(root, 'Chat settings'))

    expect(loadModels).toHaveBeenCalledOnce()
  })

  it('attaches the realm totals once the user is signed in', async () => {
    aruna.currentUser.value = { name: 'Ada Lovelace' }
    aruna.usageInfo.value = { metadata_documents: 12, objects: 40, buckets: 6 }
    aruna.myGroups.value = [{}, {}]
    aruna.realmInfo.value = { nodes: [{ kind: 'server', present: true }, { kind: 'user', present: false }] }
    const { root } = await mountApp(ChatComposer, { props: { size: 'full' } })

    await typeValue(control(root, 'Message'), 'count')
    await click(control(root, 'Send'))

    expect(send.mock.calls[0][1].realm).toEqual({
      datasets: 12,
      profiles: 0,
      groups: 2,
      nodesOnline: '1 / 1',
      objects: 40,
      buckets: 6,
    })
  })

  it('offers to unlock when the chosen keys are sealed on the node', async () => {
    vaultState.value = 'locked'
    chat.provider.value = null
    const { root } = await mountApp(ChatComposer)

    expect(content(root)).toContain('Your provider keys are locked.')
    await click(control(root, 'Send'))
    expect(send).not.toHaveBeenCalled()

    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'Unlock'))
    expect(element(root, (node) => node.props['data-unlock'] !== undefined)).toBeDefined()
  })

  it('stays quiet while a session key answers', async () => {
    vaultState.value = 'locked'
    const { root } = await mountApp(ChatComposer)

    expect(content(root)).not.toContain('provider keys are locked')
  })

  it('points at the locked keys when another provider stands in', async () => {
    // The stored choice names a sealed key; a node sign-in answers meanwhile.
    vaultState.value = 'locked'
    chat.providerId.value = 'browser-sealed'
    const { root } = await mountApp(ChatComposer)

    expect(content(root)).toContain('Your provider keys are locked.')
  })

  it('asks before a model change and offers to keep the current one', async () => {
    chat.switchNotice.value = { providerId: 'browser-1', providerLabel: 'OpenAI', model: 'gpt-5.5', messages: 4, kiloChars: 12 }
    const { root } = await mountApp(ChatComposer)

    expect(content(root)).toContain('Switching to gpt-5.5: the new model reads the whole chat again (4 messages, about 12 thousand characters)')
    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'Switch'))
    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'Keep current'))

    expect(confirmSwitch).toHaveBeenCalledOnce()
    expect(keepCurrent).toHaveBeenCalledOnce()
  })

  it('says which provider was removed and offers the picker', async () => {
    chat.provider.value = null
    chat.providerId.value = ''
    chat.removed.value = { id: 'browser-1', label: 'OpenAI' }
    const { root } = await mountApp(ChatComposer)

    expect(content(root)).toContain('The provider OpenAI was removed. Pick a provider to continue.')
    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'Pick a provider'))
    expect(loadModels).toHaveBeenCalled()
    expect(control(root, 'Send').props.disabled).toBe(true)
  })

  it('explains the tool state and the send keys on the page', async () => {
    chat.toolsNote.value = 'The node tools are unavailable.'
    const { root } = await mountApp(ChatComposer, { props: { size: 'full' } })

    expect(content(root)).toContain('The node tools are unavailable.')
    expect(content(root)).toContain('Enter sends, Shift+Enter starts a new line.')
  })
})
