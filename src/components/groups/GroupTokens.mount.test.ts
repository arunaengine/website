import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Utils from '@/lib/utils'
import * as StateBadge from '@/lib/stateBadge'
import type { GroupToken } from '@/lib/api'

const TOKENS: GroupToken[] = [
  { kind: 's3_credential', id: 'KEY1', owner: 'u1', created_at: '2026-04-09T12:00:00Z', expires_at: '2027-04-09T12:00:00Z', last_used_at: null, status: 'active' },
  { kind: 'session', id: 'S1', owner: 'svc', created_at: '2026-04-09T12:00:00Z', expires_at: '2026-04-10T12:00:00Z', last_used_at: null, status: 'revoked' },
]
const listGroupTokens = vi.fn(async (..._args: unknown[]) => ({ tokens: TOKENS }))
const revokeGroupToken = vi.fn(async (..._args: unknown[]) => ({ revoked: 1, all_tokens: false }))
const Empty = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const ConfirmStub = defineComponent({
  props: { open: Boolean, description: String },
  emits: ['confirm'],
  setup: (props, { emit }) => () => props.open
    ? h('div', { 'data-confirm': '' }, [props.description, h('button', { onClick: () => emit('confirm') }, 'Confirm')])
    : null,
})

const GroupTokens = compileClientComponent(new URL('./GroupTokens.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/lib/utils': Utils,
  '@/lib/stateBadge': StateBadge,
  '@/lib/api': { listGroupTokens, revokeGroupToken },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({ resolveUsers: vi.fn(), cachedUser: (id: string) => (id === 'u1' ? { name: 'Ada' } : undefined) }),
  },
  '@/composables/aruna/state': { refreshContext: () => ({ epoch: 1, client: {} }), sessionEpoch: ref(1) },
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/ConfirmDialog.vue': moduleDefault(ConfirmStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
})

afterEach(() => vi.clearAllMocks())

describe('group tokens', () => {
  it('lists owner, kind and status and offers revoke only on active tokens', async () => {
    const mounted = await mountApp(GroupTokens, { props: { groupId: 'g1' } })
    await flush()
    const text = content(mounted.root)
    expect(listGroupTokens).toHaveBeenCalledWith('g1', {})
    expect(text).toContain('Ada')
    expect(text).toContain('S3 key')
    expect(text).toContain('Service account token')
    expect(text).toContain('Revoked')
    const revokes = nodes(mounted.root).filter((node) => node.tag === 'button' && content(node).includes('Revoke'))
    expect(revokes).toHaveLength(1)
    mounted.app.unmount()
  })

  it('revokes a token only after the confirmation and reloads the list', async () => {
    const mounted = await mountApp(GroupTokens, { props: { groupId: 'g1' } })
    await flush()
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).includes('Revoke')))
    expect(revokeGroupToken).not.toHaveBeenCalled()
    expect(content(element(mounted.root, (node) => node.props['data-confirm'] !== undefined))).toContain('S3 key of Ada')
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node) === 'Confirm'))
    expect(revokeGroupToken).toHaveBeenCalledWith('g1', 's3_credential', 'KEY1', {})
    expect(listGroupTokens).toHaveBeenCalledTimes(2)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
