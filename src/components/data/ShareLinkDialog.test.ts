import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as ShareLinks from '@/lib/shareLinks'
import { formatDateTime } from '@/lib/utils'

interface Sent {
  url: string
  method: string
  body: unknown
}

const answers: Array<{ status?: number; body?: unknown }> = []
let sent: Sent[] = []
const copied: string[] = []

function share(overrides: Record<string, unknown> = {}) {
  return {
    id: 'S1',
    target: { kind: 'folder', bucket: 'data', prefix: 'results/' },
    mode: 'read',
    label: '',
    created_at: '2026-10-31T09:00:00Z',
    expires_at: null,
    password: false,
    revoked_at: null,
    status: 'active',
    downloads: 0,
    uploads: 0,
    last_access_at: null,
    ...overrides,
  }
}

const Pass = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
const ToggleStub = defineComponent({
  props: { options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', (props.options as Array<{ value: string; label: string }>).map((option) => h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label))),
})
const NoteStub = defineComponent({ props: { message: { type: String, default: '' } }, setup: (props) => () => h('p', props.message) })

const ShareLinkDialog = compileClientComponent(new URL('./ShareLinkDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(Pass),
  '@/components/ui/DialogContent.vue': moduleDefault(Pass),
  '@/components/ui/DialogDescription.vue': moduleDefault(Pass),
  '@/components/ui/DialogFooter.vue': moduleDefault(Pass),
  '@/components/ui/DialogHeader.vue': moduleDefault(Pass),
  '@/components/ui/DialogTitle.vue': moduleDefault(Pass),
  '@/components/ui/Input.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs }) => () => h('input', attrs) })),
  '@/components/ui/OptionToggle.vue': moduleDefault(ToggleStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(NoteStub),
  '@/components/ui/Select.vue': moduleDefault(Pass),
  '@/components/ui/Spinner.vue': moduleDefault(Pass),
  '@/composables/useShareLinks': {
    linkSite: () => 'https://portal.test',
    linkNode: (nodeId: string | null) => nodeId ?? 'node-local',
    shareClient: async () => ({ baseUrl: 'https://node.test/api/v1', token: 'bearer' }),
    linkFor: async (id: string) => `https://portal.test/s/node-local#token-of-${id}`,
    shareErrorMessage: (cause: unknown) => (cause instanceof Api.ApiError && cause.code === 'distributed_bucket' ? 'not for distributed buckets' : String(cause)),
  },
  '@/lib/api': Api,
  '@/lib/shareLinks': ShareLinks,
  '@/lib/utils': { copyToClipboard: async (text: string) => void copied.push(text), formatDateTime },
})

beforeEach(() => {
  sent = []
  copied.length = 0
  answers.length = 0
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    sent.push({ url: String(input), method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined })
    const next = answers.shift() ?? {}
    const status = next.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(next.body ?? {}), { status })
  }))
})

afterEach(() => vi.unstubAllGlobals())

async function open(target: Record<string, unknown>, nodeId: string | null = null) {
  const mounted = await mountApp(ShareLinkDialog, { props: { open: true, target, nodeId, name: 'results' } })
  await vi.waitFor(() => expect(sent.some((entry) => entry.url.endsWith('/shares'))).toBe(true))
  await flush()
  return mounted
}

describe('ShareLinkDialog', () => {
  it('creates a folder link that uploads and shows it with the token in the fragment', async () => {
    answers.push({ body: { shares: [] } }, { body: { share: share({ mode: 'read_upload', password: true }), token: 'S1.secret' } })
    const { root } = await open({ kind: 'folder', bucket: 'data', prefix: 'results/' }, 'node-2')

    await click(button(root, 'Read and upload'))
    const password = nodes(root).find((node) => node.tag === 'input' && node.props.type === 'password')!
    const enter = password.props['onUpdate:modelValue'] as (value: string) => void
    enter('pass phrase')
    await flush()
    await click(button(root, 'Create link'))

    await vi.waitFor(() => expect(content(root)).toContain('Copy link'))
    const created = sent.find((entry) => entry.method === 'POST')!
    expect(created.url).toBe('https://node.test/api/v1/shares')
    expect(created.body).toMatchObject({ target: { kind: 'folder', bucket: 'data', prefix: 'results/' }, mode: 'read_upload', password: 'pass phrase' })
    expect(Date.parse((created.body as { expires_at: string }).expires_at)).toBeGreaterThan(Date.now())
    const link = nodes(root).find((node) => node.tag === 'input' && node.props.id === 'share-link-url')!
    expect(link.props['model-value']).toBe('https://portal.test/s/node-2#S1.secret')
    await click(button(root, 'Copy link'))
    expect(copied).toEqual(['https://portal.test/s/node-2#S1.secret'])
  })

  it('offers files read only access and sends no expiry for No expiry', async () => {
    answers.push({ body: { shares: [] } }, { body: { share: share({ target: { kind: 'object', bucket: 'data', key: 'a.csv' } }), token: 'S1.t' } })
    const { root } = await open({ kind: 'object', bucket: 'data', key: 'a.csv' })

    expect(content(root)).not.toContain('Upload only')
    expect(content(root)).toContain('Read only')
  })

  it('lists only the links of this item and copies and revokes them', async () => {
    const other = share({ id: 'S2', target: { kind: 'bucket', bucket: 'data' } })
    answers.push({ body: { shares: [share(), other, share({ id: 'S3', status: 'revoked' })] } }, { status: 204 })
    const { root } = await open({ kind: 'folder', bucket: 'data', prefix: 'results/' })

    const rows = nodes(root).filter((node) => node.tag === 'tr')
    expect(rows).toHaveLength(3)
    expect(content(root)).toContain('Revoked')
    const copy = nodes(root).find((node) => node.tag === 'button' && node.props['aria-label'] === 'Copy link')!
    await click(copy)
    expect(copied).toEqual(['https://portal.test/s/node-local#token-of-S1'])

    await click(button(root, 'Revoke'))
    expect(sent.at(-1)).toMatchObject({ url: 'https://node.test/api/v1/shares/S1', method: 'DELETE' })
    expect(nodes(root).filter((node) => node.tag === 'button' && content(node) === 'Revoke')).toHaveLength(0)
  })

  it('names the refusal of a distributed bucket', async () => {
    answers.push({ body: { shares: [] } }, { status: 409, body: { error: 'conflict', code: 'distributed_bucket' } })
    const { root } = await open({ kind: 'bucket', bucket: 'spread' })

    await click(button(root, 'Create link'))

    await vi.waitFor(() => expect(content(root)).toContain('not for distributed buckets'))
  })
})
