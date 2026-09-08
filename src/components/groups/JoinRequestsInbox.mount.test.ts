import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Utils from '@/lib/utils'

const groupId = ref('group-1')
const sessionEpoch = ref(1)
const request = { request_id: 'request-1', group_id: 'group-1', user_id: 'member', user_name: 'Prospective Member', status: 'pending', created_at: '2026-09-08T00:00:00Z' }
const listGroupJoinRequests = vi.fn(async (_group: string) => [request])
const decideJoinRequest = vi.fn(async (_group: string, _request: string, _input: unknown) => undefined)
const Empty = defineComponent(() => () => null)
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Passthrough = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const Inbox = compileClientComponent(new URL('./JoinRequestsInbox.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/lib/utils': Utils,
  '@/composables/useAruna': { useAruna: () => ({ sessionEpoch }) },
  '@/composables/useJoinRequests': { useJoinRequests: () => ({ listGroupJoinRequests, decideJoinRequest, busy: ref(false) }) },
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Input.vue': moduleDefault(Empty),
})
const Wrapper = defineComponent(() => () => h(Inbox, { groupId: groupId.value, roles: [{ role_id: 'user-role', name: 'user' }] }))

beforeEach(() => {
  vi.clearAllMocks()
  groupId.value = 'group-1'
  listGroupJoinRequests.mockImplementation(async (group) => group === 'group-1' ? [request] : [])
})

describe('membership approval inbox', () => {
  it('approves the selected request with the default user role', async () => {
    const mounted = await mountApp(Wrapper)
    await listGroupJoinRequests.mock.results[0]!.value
    await flush()
    expect(content(mounted.root)).toContain('Prospective Member')
    await click(button(mounted.root, 'Approve'))
    listGroupJoinRequests.mockResolvedValueOnce([])
    await click(button(mounted.root, 'Approve & assign roles'))
    expect(decideJoinRequest).toHaveBeenCalledWith('group-1', 'request-1', { approve: true, role_ids: ['user-role'] })
    expect(content(mounted.root)).toContain('No pending join requests.')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('does not submit a stale decision after changing groups', async () => {
    const mounted = await mountApp(Wrapper)
    await listGroupJoinRequests.mock.results[0]!.value
    await flush()
    await click(button(mounted.root, 'Approve'))
    const stale = button(mounted.root, 'Approve & assign roles')
    groupId.value = 'group-2'
    await flush()
    await click(stale)
    expect(decideJoinRequest).not.toHaveBeenCalled()
    expect(content(mounted.root)).not.toContain('Prospective Member')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
