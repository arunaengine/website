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
} from '@/test/clientRender'
import type { AssistantProvider } from '@/lib/api/assistant'
import type { BrowserProvider } from '@/lib/assistant/browserProviders'
import * as StateBadge from '@/lib/stateBadge'
import { errorMessage } from '@/lib/utils'
import * as ProviderKinds from './providerKinds'

const load = vi.fn(async () => {})
const remove = vi.fn(async (_id: string) => {})
const check = vi.fn(async (_provider: BrowserProvider) => ({ ok: true, message: 'The provider answered.' }))
const selectProvider = vi.fn()
const testAssistantProvider = vi.fn(async () => ({ ok: true, message: 'node ok' }))

const local: BrowserProvider = { kind: 'anthropic', id: 'p-1', label: 'Work', model: 'm-1', apiKey: 'sk-1' }
const browserProvider: AssistantProvider = {
  provider_id: 'p-1',
  kind: 'anthropic',
  label: 'Work',
  models: [{ id: 'm-1' }],
  default_model: 'm-1',
  status: 'ready',
  created_at: '2026-08-01T00:00:00Z',
}
const nodeProvider: AssistantProvider = {
  provider_id: 'p-2',
  kind: 'chatgpt',
  label: 'Codex subscription',
  models: [],
  default_model: null,
  status: 'pending',
  created_at: '2026-08-01T00:00:00Z',
}

// A tab reload can leave a summary behind without the key it needs.
const keyless: BrowserProvider = { kind: 'anthropic', id: 'p-3', label: 'Stale', model: 'm-1', apiKey: '' }
const staleProvider: AssistantProvider = { ...browserProvider, provider_id: 'p-3', label: 'Stale' }

const providers = ref<AssistantProvider[]>([browserProvider, nodeProvider])
const activeProvider = ref<AssistantProvider | null>(browserProvider)
const currentUser = ref<{ id: string } | null>({ id: 'u-1' })

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const BadgeStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('span', attrs, slots.default?.()),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', { 'data-dialog': '' }, slots.default?.()) : null),
})
const EmptyStateStub = defineComponent({
  props: { title: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('div', { 'data-empty': '' }, [props.title, slots.default?.()]),
})
const FormStub = defineComponent(() => () => h('div', { 'data-form': '' }, 'provider form'))
const RefreshStub = defineComponent(() => () => h('button', { 'aria-label': 'Refresh providers' }))
const SpinnerStub = defineComponent(() => () => h('span', { 'data-spinner': '' }))
const IconStub = defineComponent(() => () => h('i'))
const icons = new Proxy({}, { get: () => IconStub })

const AssistantProviders = compileClientComponent(new URL('./AssistantProviders.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/RefreshButton.vue': moduleDefault(RefreshStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  './ProviderForm.vue': moduleDefault(FormStub),
  './ProviderIcon.vue': moduleDefault(IconStub),
  './providerKinds': ProviderKinds,
  '@/composables/useAruna': { useAruna: () => ({ currentUser, sessionEpoch: ref(1) }) },
  '@/composables/useAssistantChat': {
    useAssistantChat: () => ({ provider: activeProvider, selectProvider }),
  },
  '@/composables/useAssistantProviders': {
    useAssistantProviders: () => ({
      providers,
      loading: ref(false),
      error: ref(null),
      load,
      remove,
      check,
      direct: (id: string) => (id === 'p-1' ? local : id === 'p-3' ? keyless : null),
    }),
  },
  '@/composables/aruna/state': { apiBaseUrl: ref('https://node.test'), authToken: ref('t') },
  '@/lib/api': { testAssistantProvider },
  '@/lib/stateBadge': StateBadge,
  '@/lib/utils': { errorMessage },
})

function menuItem(root: Parameters<typeof content>[0], label: string) {
  return button(root, label)
}

beforeEach(() => {
  load.mockClear()
  remove.mockClear()
  check.mockClear()
  selectProvider.mockClear()
  testAssistantProvider.mockClear()
  providers.value = [browserProvider, nodeProvider]
  activeProvider.value = browserProvider
  currentUser.value = { id: 'u-1' }
})

describe('AssistantProviders', () => {
  it('lists every provider with its status chip and the default marker', async () => {
    providers.value = [browserProvider, nodeProvider, staleProvider]
    const { root } = await mountApp(AssistantProviders)
    const text = content(root)

    expect(text).toContain('Work')
    expect(text).toContain('Codex subscription')
    expect(text).toContain('Ready')
    expect(text).toContain('Pending login')
    expect(text).toContain('Needs key')
    expect(text).toContain('Default')
    // The row shows where the credential is kept, browser tab or node.
    expect(text).toContain('This tab')
    expect(text).toContain('Node')
  })

  it('opens the add dialog from the primary button', async () => {
    const { root } = await mountApp(AssistantProviders)
    expect(() => element(root, (node) => node.props['data-form'] !== undefined)).toThrow()

    await click(button(root, 'Add provider'))

    expect(element(root, (node) => node.props['data-form'] !== undefined)).toBeDefined()
    expect(content(root)).toContain('Add provider')
  })

  it('asks for confirmation before removing a provider', async () => {
    const { root } = await mountApp(AssistantProviders)
    await click(menuItem(root, 'Remove'))

    expect(remove).not.toHaveBeenCalled()
    expect(content(root)).toContain('Remove Work?')

    await click(element(root, (node) => node.tag === 'button' && node.props.variant === 'destructive'))

    expect(remove).toHaveBeenCalledWith('p-1')
  })

  it('makes a ready provider the default from its row menu', async () => {
    activeProvider.value = nodeProvider
    const { root } = await mountApp(AssistantProviders)
    await click(menuItem(root, 'Set as default'))

    expect(selectProvider).toHaveBeenCalledWith('p-1')
  })

  it('tests a browser provider without touching the node', async () => {
    const { root } = await mountApp(AssistantProviders)
    await click(menuItem(root, 'Test connection'))

    expect(check).toHaveBeenCalledWith(local)
    expect(testAssistantProvider).not.toHaveBeenCalled()
    expect(content(root)).toContain('The provider answered.')
  })

  it('offers to add a provider when none is configured', async () => {
    providers.value = []
    const { root } = await mountApp(AssistantProviders)

    expect(content(root)).toContain('No providers yet.')
  })
})
