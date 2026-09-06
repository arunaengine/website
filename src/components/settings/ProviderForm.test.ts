import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import type { AssistantProvider } from '@/lib/api/assistant'
import { errorMessage } from '@/lib/utils'
import * as ModelOptions from '@/lib/assistant/modelOptions'
import * as BrowserProviders from '@/lib/assistant/browserProviders'
import type { BrowserProvider } from '@/lib/assistant/browserProviders'
import * as ProviderKinds from './providerKinds'

const create = vi.fn(async (provider: Record<string, unknown>, _storage?: string) => ({
  provider_id: provider.id,
  kind: provider.kind,
  label: provider.label,
  models: [{ id: provider.model }],
  default_model: provider.model,
  status: 'ready',
}))
const update = vi.fn(async (id: string, provider: Record<string, unknown>, _storage?: string) => ({
  provider_id: id,
  kind: provider.kind,
  label: provider.label,
  models: [{ id: provider.model }],
  default_model: provider.model,
  status: 'ready',
}))
const check = vi.fn(async (_provider: Record<string, unknown>) => ({ ok: true, message: 'ok' }))
const models = vi.fn(async (_provider: Record<string, unknown>) => [{ id: 'm-1' }])
const direct = vi.fn((_id: string): BrowserProvider | null => null)
const storageOf = vi.fn((_id: string): 'session' | 'node' | null => null)
const vaultState = ref<'absent' | 'locked' | 'unlocked' | 'unsupported'>('absent')

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, placeholder: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('input', {
      placeholder: props.placeholder,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})
const SelectStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] }, ariaLabel: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', { 'aria-label': props.ariaLabel }, (props.options as Array<{ value: string; label: string }>).map(
      (option) => h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label),
    )),
})
const NoticeStub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const SpinnerStub = defineComponent(() => () => h('span', { 'data-spinner': '' }))
const ComboboxStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, ariaLabel: String, suggestions: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('input', {
      'aria-label': props.ariaLabel,
      value: props.modelValue,
      'data-suggestions': (props.suggestions as Array<{ id: string }>).map((model) => model.id).join(','),
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})
const IconStub = defineComponent(() => () => h('i'))
const LoginStub = defineComponent(() => () => h('div', { 'data-login': '' }, 'Sign in with Codex'))
const GateStub = defineComponent(() => () => h('div', { 'data-gate': '' }))
const ToggleStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', (props.options as Array<{ value: string; label: string }>).map(
      (option) => h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label),
    )),
})
const icons = new Proxy({}, { get: () => IconStub })

const ProviderForm = compileClientComponent(new URL('./ProviderForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/OptionToggle.vue': moduleDefault(ToggleStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/components/assistant/ModelCombobox.vue': moduleDefault(ComboboxStub),
  './ChatGptLogin.vue': moduleDefault(LoginStub),
  './ProviderIcon.vue': moduleDefault(IconStub),
  './VaultGate.vue': moduleDefault(GateStub),
  './providerKinds': ProviderKinds,
  '@/lib/assistant/modelOptions': ModelOptions,
  '@/lib/assistant/browserProviders': BrowserProviders,
  '@/composables/useAssistantProviders': {
    useAssistantProviders: () => ({ create, update, check, models, direct, storageOf }),
  },
  '@/composables/useUserVault': { useUserVault: () => ({ state: vaultState }) },
  '@/lib/utils': { errorMessage },
})

function field(root: Parameters<typeof content>[0], placeholder: string) {
  return element(root, (node) => node.tag === 'input' && node.props.placeholder === placeholder)
}

function modelField(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'Default model')
}

/** Picks where the key is kept through the radio group. */
async function pickStorage(root: Parameters<typeof content>[0], value: 'session' | 'node') {
  const radio = element(root, (node) => node.tag === 'input' && node.props.type === 'radio' && node.props.value === value)
  ;(radio.props.onChange as () => void)()
  await flush()
}

const stored: AssistantProvider = {
  provider_id: 'p-1',
  kind: 'anthropic',
  label: 'Work',
  models: [{ id: 'm-1' }],
  default_model: 'm-1',
  status: 'ready',
  created_at: '2026-08-01T00:00:00Z',
}

/** Adding starts on the kind step; Claude is the browser-held key provider. */
async function addClaude() {
  const mounted = await mountApp(ProviderForm)
  await click(button(mounted.root, 'Claude'))
  await typeValue(field(mounted.root, 'Work account'), 'Work')
  await typeValue(field(mounted.root, 'Paste the key'), 'sk-1')
  await typeValue(modelField(mounted.root), 'claude-sonnet')
  return mounted
}

/** The OpenAI choice needs only a name and a key before models can be listed. */
async function addOpenAi() {
  const mounted = await mountApp(ProviderForm)
  await click(button(mounted.root, 'OpenAI'))
  await typeValue(field(mounted.root, 'Work account'), 'Team')
  await typeValue(field(mounted.root, 'Paste the key'), 'sk-2')
  return mounted
}

beforeEach(() => {
  create.mockClear()
  update.mockClear()
  check.mockClear()
  models.mockClear()
  direct.mockClear()
  check.mockResolvedValue({ ok: true, message: 'ok' })
  direct.mockReturnValue(null)
  storageOf.mockReturnValue(null)
  vaultState.value = 'absent'
})

describe('ProviderForm', () => {
  it('tests the connection first and adds the provider when it answers', async () => {
    const { root } = await mountApp(ProviderForm)
    await click(button(root, 'Claude'))
    expect(button(root, 'Add provider').props.disabled).toBe(true)

    await typeValue(field(root, 'Work account'), 'Work')
    await typeValue(field(root, 'Paste the key'), 'sk-1')
    await typeValue(modelField(root), 'claude-sonnet')
    expect(button(root, 'Add provider').props.disabled).toBe(false)

    await click(button(root, 'Add provider'))

    expect(check).toHaveBeenCalledWith(expect.objectContaining({ kind: 'anthropic', label: 'Work', model: 'claude-sonnet', apiKey: 'sk-1' }))
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][1]).toBe('session')
    expect(check.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0])
  })

  it('keeps a new key on the node once keys exist there', async () => {
    vaultState.value = 'unlocked'
    const { root } = await addClaude()
    await click(button(root, 'Add provider'))

    expect(create.mock.calls[0][1]).toBe('node')
    expect(() => element(root, (node) => node.props['data-gate'] !== undefined)).toThrow()
  })

  it('waits for the passphrase before a key can go to the node', async () => {
    const { root } = await addClaude()
    await pickStorage(root, 'node')

    expect(element(root, (node) => node.props['data-gate'] !== undefined)).toBeDefined()
    expect(button(root, 'Add provider').props.disabled).toBe(true)

    vaultState.value = 'unlocked'
    await flush()
    expect(button(root, 'Add provider').props.disabled).toBe(false)
    await click(button(root, 'Add provider'))
    expect(create.mock.calls[0][1]).toBe('node')
  })

  it('offers no storage choice when the node cannot keep keys', async () => {
    vaultState.value = 'unsupported'
    const { root } = await addClaude()

    expect(() => element(root, (node) => node.tag === 'input' && node.props.type === 'radio')).toThrow()
  })

  it('keeps the form with the reason when the provider refuses the key', async () => {
    check.mockResolvedValueOnce({ ok: false, message: 'bad key' })
    const { root } = await addClaude()
    await click(button(root, 'Add provider'))

    expect(content(root)).toContain('bad key')
    expect(create).not.toHaveBeenCalled()
    expect(field(root, 'Paste the key').props.value).toBe('sk-1')
    expect(button(root, 'Add provider').props.disabled).toBe(false)
  })

  it('keeps a test and model discovery side effect free until the provider is added', async () => {
    const { root } = await addClaude()
    await click(button(root, 'Test only'))
    expect(content(root)).toContain('The provider answered.')
    await click(button(root, 'Fetch models'))

    expect(check).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
    expect(models).toHaveBeenCalledWith(expect.objectContaining({ kind: 'anthropic', apiKey: 'sk-1' }))
    await click(button(root, 'Add provider'))
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ models: [{ id: 'm-1' }] }))
  })

  it('keeps the tab-stored key when editing without retyping it', async () => {
    // The browser keeps the key locally, so an untouched field must not clear it.
    direct.mockReturnValue({ kind: 'anthropic', id: 'p-1', label: 'Work', model: 'm-1', apiKey: 'stored-key' })
    const { root } = await mountApp(ProviderForm, { props: { provider: stored } })
    await click(button(root, 'Save'))

    expect(create).not.toHaveBeenCalled()
    expect(update.mock.calls[0][0]).toBe('p-1')
    expect(update.mock.calls[0][1]).toEqual(expect.objectContaining({ apiKey: 'stored-key' }))
  })

  it('stores a model id typed by hand as the default', async () => {
    // A fine-tune or a brand-new model needs no entry in the fetched list.
    direct.mockReturnValue({ kind: 'anthropic', id: 'p-1', label: 'Work', model: 'm-1', apiKey: 'stored-key' })
    const { root } = await mountApp(ProviderForm, { props: { provider: stored } })
    const model = modelField(root)
    expect(model.props['data-suggestions']).toBe('m-1')

    await typeValue(model, '  my-fine-tune ')
    await click(button(root, 'Save'))

    expect(update.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ model: 'my-fine-tune' }))
  })

  it('shows only the fields the chosen kind needs', async () => {
    const { root } = await mountApp(ProviderForm)
    expect(() => field(root, 'Work account')).toThrow()

    await click(button(root, 'Claude'))
    expect(() => field(root, 'http://localhost:11434/v1')).toThrow()

    await click(button(root, 'Change'))
    await click(button(root, 'OpenAI-compatible or local'))

    expect(field(root, 'http://localhost:11434/v1')).toBeDefined()
    expect(content(root)).toContain('Responses')
  })

  it('offers the ChatGPT sign-in instead of a key form', async () => {
    const { root } = await mountApp(ProviderForm)
    await click(button(root, 'ChatGPT subscription'))

    expect(content(root)).toContain('Sign in with Codex')
    expect(() => button(root, 'Add provider')).toThrow()
  })

  it('stores the web search choice of a compatible endpoint', async () => {
    const { root } = await mountApp(ProviderForm)
    await click(button(root, 'OpenAI-compatible or local'))
    await typeValue(field(root, 'Work account'), 'Proxy')
    await typeValue(field(root, 'http://localhost:11434/v1'), 'https://litellm.test/v1')
    await typeValue(modelField(root), 'jlu/qwen')
    await click(element(root, (node) => node.tag === 'button' && content(node).trim() === 'Off'))
    await click(button(root, 'Add provider'))

    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ kind: 'openai_compatible', webSearch: 'off' }))
  })

  it('fills the model picker from the OpenAI listing', async () => {
    models.mockResolvedValueOnce([{ id: 'gpt-5.6-sol' }, { id: 'gpt-4.1' }])
    const { root } = await addOpenAi()
    await click(button(root, 'Fetch models'))

    expect(models).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-2',
    }))
    expect(modelField(root).props['data-suggestions']).toBe('gpt-5.6-sol,gpt-4.1')
    expect(modelField(root).props.value).toBe('gpt-5.6-sol')
  })

  it('offers the known OpenAI models when the listing is refused', async () => {
    // An OpenAI key without the model read scope cannot list the account.
    models.mockRejectedValueOnce(new Error('Provider model listing failed (401).'))
    const known = ModelOptions.OPENAI_MODELS.map((model) => model.id)
    const { root } = await addOpenAi()
    await click(button(root, 'Fetch models'))

    expect(content(root)).toContain('Provider model listing failed (401).')
    expect(modelField(root).props['data-suggestions']).toBe(known.join(','))
    expect(modelField(root).props.value).toBe(known[0])
  })

  it('keeps a refused listing bare outside the OpenAI root', async () => {
    models.mockRejectedValueOnce(new Error('fetch failed'))
    const { root } = await addClaude()
    await click(button(root, 'Fetch models'))

    expect(content(root)).toContain('fetch failed')
    expect(modelField(root).props['data-suggestions']).toBe('')
  })

  it('sends the official OpenAI root without asking for it', async () => {
    const { root } = await mountApp(ProviderForm)
    await click(button(root, 'OpenAI'))
    await typeValue(field(root, 'Work account'), 'Team')
    await typeValue(field(root, 'Paste the key'), 'sk-2')
    await typeValue(modelField(root), 'gpt-5')
    await click(button(root, 'Test only'))

    expect(check).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      protocol: 'responses',
      apiKey: 'sk-2',
    }))
  })
})
