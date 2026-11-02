import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import { ADDABLE_PROVIDER_KINDS, PROVIDER_KIND_LABELS, type CentralAssistant, type SetCentralRequest } from '@/lib/api/assistant'

const stored: CentralAssistant = {
  kind: 'openai_compatible',
  label: 'Realm assistant',
  models: [{ id: 'deepseek-v4.1' }],
  default_model: 'deepseek-v4.1',
  daily_limit: 50,
  used_today: 0,
  resets_at: '2026-11-03T00:00:00Z',
  admin: {
    base_url: 'https://chat.example.org/api',
    holder_node: 'node-1',
    changed_by: 'u-1',
    changed_at: '2026-11-02T09:42:00Z',
    user_header: 'x-user-id',
    session_header: 'x-session-id',
  },
}

const getCentralAssistant = vi.fn(async (): Promise<CentralAssistant | null> => stored)
const putCentralAssistant = vi.fn(async (_request: SetCentralRequest) => stored)
const deleteCentralAssistant = vi.fn(async () => {})
const testCentralAssistant = vi.fn(async () => ({
  ok: true,
  message: 'Provider is ready',
  models: [{ id: 'deepseek-v4.1' }, { id: 'deepseek-v4.1-reasoner' }],
}))
const load = vi.fn(async () => {})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const RealmAssistant = compileClientComponent(new URL('./RealmAssistant.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/IconTile.vue': moduleDefault(Passthrough),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/NodeLabel.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/SectionHeading.vue': moduleDefault(Passthrough),
  '@/components/ui/Select.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Passthrough),
  '@/composables/aruna/state': { apiBaseUrl: ref('https://node.test'), authToken: ref('t') },
  '@/composables/useAssistantProviders': { useAssistantProviders: () => ({ load }) },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({ resolveUsers: vi.fn(async () => []), cachedUser: () => ({ name: 'Ada Admin' }) }),
  },
  '@/lib/api': {
    ADDABLE_PROVIDER_KINDS,
    PROVIDER_KIND_LABELS,
    SESSION_HEADER: 'x-session-id',
    apiErrorMessage: (cause: unknown) => String(cause),
    deleteCentralAssistant,
    getCentralAssistant,
    putCentralAssistant,
    testCentralAssistant,
  },
  '@/lib/utils': { formatDateTime: () => '2 Nov 2026, 09:42', relativeTime: () => 'just now' },
})

function field(root: Parameters<typeof content>[0], label: string) {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === label)
}

beforeEach(() => {
  getCentralAssistant.mockClear()
  putCentralAssistant.mockClear()
  testCentralAssistant.mockClear()
  load.mockClear()
})

describe('RealmAssistant', () => {
  it('never shows the stored key and keeps it on save', async () => {
    const { root } = await mountApp(RealmAssistant)

    expect(field(root, 'API key').props.value).toBe('')
    expect(field(root, 'API key').props.placeholder).toBe('Key saved. Type to replace it.')
    expect(content(root)).toContain('Connected')
    expect(content(root)).toContain('Ada Admin')
    await click(button(root, 'Save'))

    expect(putCentralAssistant.mock.calls[0][0]).not.toHaveProperty('api_key')
    expect(putCentralAssistant.mock.calls[0][0]).toMatchObject({
      base_url: 'https://chat.example.org/api',
      models: [{ id: 'deepseek-v4.1' }],
      default_model: 'deepseek-v4.1',
      daily_limit: 50,
    })
    expect(load).toHaveBeenCalled()
  })

  it('allows a loaded model and sends a new key', async () => {
    const { root } = await mountApp(RealmAssistant)
    const reasoner = element(root, (node) => node.props['aria-label'] === 'Allow deepseek-v4.1-reasoner')

    ;(reasoner.props.onChange as () => void)()
    await flush()
    await typeValue(field(root, 'API key'), 'sk-new')
    await typeValue(field(root, 'Daily limit per member'), '')
    await click(button(root, 'Save'))

    expect(putCentralAssistant.mock.calls[0][0]).toMatchObject({
      api_key: 'sk-new',
      models: [{ id: 'deepseek-v4.1' }, { id: 'deepseek-v4.1-reasoner' }],
      daily_limit: null,
    })
  })

  it('asks for a first save before models can load', async () => {
    getCentralAssistant.mockResolvedValueOnce(null)
    const { root } = await mountApp(RealmAssistant)

    expect(content(root)).toContain('Save first, then load the models.')
    expect(button(root, 'Load models').props.disabled).toBe(true)
    expect(content(root)).not.toContain('Remove')
    expect(testCentralAssistant).not.toHaveBeenCalled()
  })

  it('refuses a daily limit that is not a whole number', async () => {
    const { root } = await mountApp(RealmAssistant)

    await typeValue(field(root, 'Daily limit per member'), '2.5')
    await click(button(root, 'Save'))

    expect(putCentralAssistant).not.toHaveBeenCalled()
    expect(content(root)).toContain('The daily limit must be a whole number.')
  })
})
