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
import { ADDABLE_PROVIDER_KINDS, PROVIDER_KIND_LABELS, type AssistantProvider } from '@/lib/api/assistant'
import { errorMessage } from '@/lib/utils'

const create = vi.fn(async (_request: Record<string, unknown>) => ({ provider_id: 'p-new' }))
const update = vi.fn(async (_id: string, _patch: Record<string, unknown>) => ({ provider_id: 'p-new' }))
const check = vi.fn(async (_id: string) => ({ ok: true, message: 'ok' }))
const models = vi.fn(async (_id: string) => [{ id: 'm-1' }])

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
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const ProviderForm = compileClientComponent(new URL('./ProviderForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/useAssistantProviders': {
    useAssistantProviders: () => ({ create, update, check, models }),
  },
  '@/lib/api': { ADDABLE_PROVIDER_KINDS, PROVIDER_KIND_LABELS },
  '@/lib/utils': { errorMessage },
})

function field(root: Parameters<typeof content>[0], placeholder: string) {
  return element(root, (node) => node.tag === 'input' && node.props.placeholder === placeholder)
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

beforeEach(() => {
  create.mockClear()
  update.mockClear()
  check.mockClear()
  models.mockClear()
  check.mockResolvedValue({ ok: true, message: 'ok' })
})

describe('ProviderForm', () => {
  it('keeps Save disabled until the connection test passes', async () => {
    const { root } = await mountApp(ProviderForm)
    await typeValue(field(root, 'Work account'), 'Work')
    await typeValue(field(root, 'Paste the provider key'), 'sk-1')

    expect(button(root, 'Save provider').props.disabled).toBe(true)

    await click(button(root, 'Test connection'))

    expect(create).toHaveBeenCalledWith({ kind: 'anthropic', label: 'Work', api_key: 'sk-1' })
    expect(check).toHaveBeenCalledWith('p-new')
    expect(button(root, 'Save provider').props.disabled).toBe(false)
  })

  it('keeps Save disabled when the provider refuses the credentials', async () => {
    check.mockResolvedValueOnce({ ok: false, message: 'bad key' })
    const { root } = await mountApp(ProviderForm)
    await typeValue(field(root, 'Work account'), 'Work')
    await typeValue(field(root, 'Paste the provider key'), 'sk-1')
    await click(button(root, 'Test connection'))

    expect(content(root)).toContain('bad key')
    expect(button(root, 'Save provider').props.disabled).toBe(true)
  })

  it('creates the record once and patches every later attempt', async () => {
    const { root } = await mountApp(ProviderForm)
    await typeValue(field(root, 'Work account'), 'Work')
    await typeValue(field(root, 'Paste the provider key'), 'sk-1')
    await click(button(root, 'Test connection'))
    await click(button(root, 'Fetch models'))

    expect(create).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith('p-new', { label: 'Work' })
  })

  it('omits the stored key from a patch that did not retype it', async () => {
    // The node never sends a key back, so an untouched field must not clear it.
    const { root } = await mountApp(ProviderForm, { props: { provider: stored } })
    await click(button(root, 'Save provider'))

    expect(create).not.toHaveBeenCalled()
    expect(update.mock.calls[0]).toEqual(['p-1', { label: 'Work' }])
    expect(Object.keys(update.mock.calls[0][1] as object)).not.toContain('api_key')
  })

  it('asks for a base URL only for an openai-compatible provider', async () => {
    const { root } = await mountApp(ProviderForm)
    expect(() => field(root, 'https://api.example.org/v1')).toThrow()

    await click(button(root, PROVIDER_KIND_LABELS.openai_compatible))

    expect(field(root, 'https://api.example.org/v1')).toBeDefined()
    expect(content(root)).toContain('OLLAMA_ORIGINS')
  })
})
