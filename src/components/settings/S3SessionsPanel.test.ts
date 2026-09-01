import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import { isUnsupportedEndpoint } from '@/composables/aruna/connectors'
import { relativeTime } from '@/lib/utils'

interface Call {
  url: string
  method: string
}

function stubFetch(responses: Array<{ payload?: unknown; status?: number }>): Call[] {
  const calls: Call[] = []
  const queue = [...responses]
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    calls.push({ url: String(input), method: init.method ?? 'GET' })
    const next = queue.shift() ?? { payload: { sessions: [] } }
    const status = next.status ?? 200
    if (status === 204 || status >= 400) return new Response(null, { status })
    return new Response(JSON.stringify(next.payload), { status })
  }))
  return calls
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const NoteStub = defineComponent({
  props: { message: { type: String, default: '' } },
  setup: (props) => () => h('p', props.message),
})

const aruna = {
  apiBaseUrl: ref('https://api.test/api/v1'),
  authToken: ref('bearer-1'),
  currentUser: ref<Record<string, unknown> | null>({ id: 'u1' }),
  myGroups: ref([{ id: 'g1', name: 'Genomics' }]),
  discoverableGroups: ref([]),
}

const S3SessionsPanel = compileClientComponent(new URL('./S3SessionsPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(NoteStub),
  '@/composables/useAruna': { useAruna: () => aruna, isUnsupportedEndpoint },
  '@/lib/api': Api,
  '@/lib/utils': { relativeTime },
})

function session(overrides: Record<string, unknown> = {}) {
  return {
    access_key_id: 'AK1',
    group_id: 'g1',
    created_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  aruna.currentUser.value = { id: 'u1' }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('S3SessionsPanel', () => {
  it('lists a session with its key, group and expiry', async () => {
    const calls = stubFetch([{ payload: { sessions: [session()] } }])
    const { root } = await mountApp(S3SessionsPanel)

    await vi.waitFor(() => expect(content(root)).toContain('AK1'))
    expect(calls[0]).toEqual({ url: 'https://api.test/api/v1/access/s3/sessions', method: 'GET' })
    expect(content(root)).toContain('Genomics')
    expect(content(root)).toContain('in 1h')
  })

  it('revokes a session and drops its row', async () => {
    const calls = stubFetch([
      { payload: { sessions: [session(), session({ access_key_id: 'AK2' })] } },
      { status: 204 },
    ])
    const { root } = await mountApp(S3SessionsPanel)
    await vi.waitFor(() => expect(content(root)).toContain('AK1'))

    await click(button(root, 'Revoke'))

    await vi.waitFor(() => expect(content(root)).not.toContain('AK1'))
    expect(calls[1]).toEqual({
      url: 'https://api.test/api/v1/access/s3/sessions/AK1',
      method: 'DELETE',
    })
    expect(content(root)).toContain('AK2')
  })

  it('stays hidden on a node without the list route', async () => {
    // A 404 means the node does not serve the feature, not that it failed.
    const calls = stubFetch([{ status: 404 }])
    const { root } = await mountApp(S3SessionsPanel)

    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await flush()

    expect(content(root)).toBe('')
  })
})
