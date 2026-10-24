import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import { button, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

const request = { request_id: 'q1', group_id: 'g1', user_id: 'u1', status: 'pending', created_at: '' }
const withdrawRequest = vi.fn(async (_request: unknown) => undefined)
const reportGlobalError = vi.fn()
const sessionEpoch = ref(1)
const pendingByGroup = ref(new Map([['g1', request]]))

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const JoinRequestButton = compileClientComponent(new URL('./JoinRequestButton.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Dialog.vue': moduleDefault(Empty),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogClose.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/components/ui/Textarea.vue': moduleDefault(Empty),
  '@/composables/useJoinRequests': {
    useJoinRequests: () => ({
      joinRequestsEnabled: ref(true),
      pendingByGroup,
      ensureOwnRequestsLoaded: vi.fn(),
      requestJoin: vi.fn(),
      withdrawRequest,
      busy: ref(false),
    }),
  },
  '@/composables/useAruna': {
    useAruna: () => ({ currentUser: ref({ id: 'u1' }), myGroups: ref([]), sessionEpoch }),
  },
  '@/composables/useGlobalErrors': { reportGlobalError },
  '@/lib/utils': Utils,
})

beforeEach(() => vi.clearAllMocks())

describe('JoinRequestButton', () => {
  it('starts a new session without the wait of a withdrawal from the one before', async () => {
    withdrawRequest.mockReturnValueOnce(new Promise<undefined>(() => {}))
    const { root } = await mountApp(defineComponent(() => () => h(JoinRequestButton, { groupId: 'g1' })))
    void (button(root, 'Withdraw').props.onClick as () => Promise<void>)()
    await flush()
    expect(button(root, 'Withdrawing the request').props['aria-busy']).toBe(true)
    sessionEpoch.value++
    pendingByGroup.value = new Map([['g1', { ...request, request_id: 'q2' }]])
    await flush()
    expect(button(root, 'Withdraw').props['aria-busy']).toBe(false)
    expect(button(root, 'Withdraw').props.disabled).toBe(false)
    pendingByGroup.value = new Map([['g1', request]])
  })

  it('shows the wait on Withdraw, sends it once and frees it when it fails', async () => {
    let refuse: (err: unknown) => void = () => {}
    withdrawRequest.mockReturnValueOnce(new Promise<undefined>((_, reject) => (refuse = reject)))
    const { root } = await mountApp(defineComponent(() => () => h(JoinRequestButton, { groupId: 'g1' })))
    void (button(root, 'Withdraw').props.onClick as () => Promise<void>)()
    await flush()
    const waiting = button(root, 'Withdrawing the request')
    expect(waiting.props['aria-busy']).toBe(true)
    expect(waiting.props.disabled).toBe(true)
    await (waiting.props.onClick as () => Promise<void>)()
    expect(withdrawRequest).toHaveBeenCalledTimes(1)
    refuse(new Error('already answered'))
    await flush()
    expect(button(root, 'Withdraw').props['aria-busy']).toBe(false)
    expect(button(root, 'Withdraw').props.disabled).toBe(false)
    expect(content(root)).not.toContain('Withdrawing the request')
    expect(reportGlobalError).toHaveBeenCalledWith('already answered')
  })
})
