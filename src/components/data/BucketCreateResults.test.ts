import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type AdmissionResponse } from '@/lib/api'
import { defaultPlacement } from '@/lib/distributedMock'
import { createRequest } from '@/lib/distribution'
import { button, compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const aruna = vi.hoisted(() => ({
  sessionEpoch: { value: 1 },
  createDistributedBucket: vi.fn(),
  retryDistributedAdmission: vi.fn(),
}))

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const ResultsStub = defineComponent({
  props: { outcome: Object, failure: String },
  emits: ['retry', 'done'],
  setup: (props, { emit }) => () =>
    h('section', [
      h('p', `set ${(props.outcome as AdmissionResponse).set_id} active ${(props.outcome as AdmissionResponse).active}`),
      props.failure ? h('p', props.failure) : null,
      h('button', { onClick: () => emit('retry') }, 'retry'),
      h('button', { onClick: () => emit('done') }, 'done'),
    ]),
})

const component = compileClientComponent(new URL('./BucketCreateResults.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/distributed/CreateResults.vue': moduleDefault(ResultsStub),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/distribution': { createRequest },
})

const placement = {
  ...defaultPlacement(),
  several: true,
  members: [
    { nodeId: 'a', strategy: 'copy' as const, coverage: 'all' as const },
    { nodeId: 'b', strategy: 'copy' as const, coverage: 'all' as const },
  ],
}
const answer = (active: boolean): AdmissionResponse => ({ set_id: 's1', active, members: [] })

async function open(props: Record<string, unknown> = {}) {
  return mountApp(component, { props: { open: true, name: 'spire', groupId: 'g1', placement, ...props } })
}

describe('bucket create results', () => {
  it('creates the bucket in the group on opening and shows the answer', async () => {
    aruna.createDistributedBucket.mockReset().mockResolvedValue(answer(false))
    const { root } = await open()

    expect(aruna.createDistributedBucket).toHaveBeenCalledTimes(1)
    expect(aruna.createDistributedBucket).toHaveBeenCalledWith('g1', createRequest('spire', placement))
    expect(content(root)).toContain('set s1 active false')
  })

  it('shows the refusal of the node and no results', async () => {
    aruna.createDistributedBucket.mockReset().mockRejectedValue(new ApiError(503, 'The publisher is not reachable'))
    const { root } = await open()

    expect(content(root)).toContain('The publisher is not reachable')
    expect(content(root)).not.toContain('set s1')
  })

  it('retries the admission of the created set', async () => {
    aruna.createDistributedBucket.mockReset().mockResolvedValue(answer(false))
    aruna.retryDistributedAdmission.mockReset().mockResolvedValue(answer(true))
    const { root } = await open()
    await (button(root, 'retry').props.onClick as () => Promise<void>)()
    await Promise.resolve()

    expect(aruna.retryDistributedAdmission).toHaveBeenCalledWith('g1', 's1')
    expect(aruna.createDistributedBucket).toHaveBeenCalledTimes(1)
  })

  it('reports the created bucket and closes with Done', async () => {
    aruna.createDistributedBucket.mockReset().mockResolvedValue(answer(true))
    const created = vi.fn()
    const closed = ref<boolean | null>(null)
    const { root } = await open({ onCreated: created, 'onUpdate:open': (value: boolean) => (closed.value = value) })
    await (button(root, 'done').props.onClick as () => void)()

    expect(created).toHaveBeenCalledWith(answer(true))
    expect(closed.value).toBe(false)
  })
})
