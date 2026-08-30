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
import type { AssistantProvider } from '@/lib/api/assistant'
import { errorMessage } from '@/lib/utils'
import * as ModelOptions from '@/lib/assistant/modelOptions'
import * as BrowserProviders from '@/lib/assistant/browserProviders'
import type { BrowserProvider } from '@/lib/assistant/browserProviders'
import * as ProviderKinds from './providerKinds'

const create = vi.fn(async (provider: Record<string, unknown>) => ({
  provider_id: provider.id,
  kind: provider.kind,
  label: provider.label,
  models: [{ id: provider.model }],
  default_model: provider.model,
  status: 'ready',
}))
const update = vi.fn(async (id: string, provider: Record<string, unknown>) => ({
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
const icons = new Proxy({}, { get: () => IconStub })

const ProviderForm = compileClientComponent(new URL('./ProviderForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/components/assistant/ModelCombobox.vue': moduleDefault(ComboboxStub),
  './ChatGptLogin.vue': moduleDefault(LoginStub),
  './ProviderIcon.vue': moduleDefault(IconStub),
  './providerKinds': ProviderKinds,
  '@/lib/assistant/modelOptions': ModelOptions,
  '@/lib/assistant/browserProviders': BrowserProviders,
  '@/composables/useAssistantProviders': {
    useAssistantProviders: () => ({ create, update, check, models, direct }),
  },
  '@/lib/utils': { errorMessage },
})

function field(root: Parameters<typeof content>[0], placeholder: string) {
  return element(root, (node) => node.tag === 'input' && node.props.placeholder === placeholder)
}

function modelField(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'Default model')
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

beforeEach(() => {
  create.mockClear()
  update.mockClear()
  check.mockClear()
  models.mockClear()
  direct.mockClear()
  check.mockResolvedValue({ ok: true, message: 'ok' })
  direct.mockReturnValue(null)
})

describe('ProviderForm', () => {
  it('keeps Save disabled until the connection test passes', async () => {
    const { root } = await addClaude()

    expect(button(root, 'Save provider').props.disabled).toBe(true)

    await click(button(root, 'Test connection'))

    expect(create).not.toHaveBeenCalled()
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ kind: 'anthropic', label: 'Work', model: 'claude-sonnet', apiKey: 'sk-1' }))
    expect(button(root, 'Save provider').props.disabled).toBe(false)

    await click(button(root, 'Save provider'))
    expect(create).toHaveBeenCalledOnce()
  })

  it('keeps Save disabled when the provider refuses the credentials', async () => {
    check.mockResolvedValueOnce({ ok: false, message: 'bad key' })
    const { root } = await addClaude()
    await click(button(root, 'Test connection'))

    expect(content(root)).toContain('bad key')
    expect(create).not.toHaveBeenCalled()
    expect(button(root, 'Save provider').props.disabled).toBe(true)
  })

  it('keeps testing and model discovery side effect free until save', async () => {
    const { root } = await addClaude()
    await click(button(root, 'Test connection'))
    await click(button(root, 'Fetch models'))

    expect(create).not.toHaveBeenCalled()
    expect(models).toHaveBeenCalledWith(expect.objectContaining({ kind: 'anthropic', apiKey: 'sk-1' }))
    await click(button(root, 'Save provider'))
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({ models: [{ id: 'm-1' }] }))
  })

  it('keeps the tab-stored key when editing without retyping it', async () => {
    // The browser keeps the key locally, so an untouched field must not clear it.
    direct.mockReturnValue({ kind: 'anthropic', id: 'p-1', label: 'Work', model: 'm-1', apiKey: 'stored-key' })
    const { root } = await mountApp(ProviderForm, { props: { provider: stored } })
    await click(button(root, 'Test connection'))
    await click(button(root, 'Save provider'))

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
    await click(button(root, 'Test connection'))
    await click(button(root, 'Save provider'))

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
    expect(() => button(root, 'Save provider')).toThrow()
  })

  it('sends the official OpenAI root without asking for it', async () => {
    const { root } = await mountApp(ProviderForm)
    await click(button(root, 'OpenAI'))
    await typeValue(field(root, 'Work account'), 'Team')
    await typeValue(field(root, 'Paste the key'), 'sk-2')
    await typeValue(modelField(root), 'gpt-5')
    await click(button(root, 'Test connection'))

    expect(check).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      protocol: 'responses',
      apiKey: 'sk-2',
    }))
  })
})
