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
import * as Pid from '@/lib/pid'
import * as Utils from '@/lib/utils'

const PID = 'https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV'

const canWithdrawPids = ref(true)
const listPersistentIds = vi.fn(async () => [view('active')])
const withdrawPid = vi.fn(async () => undefined)

function view(state: Pid.PersistentIdState): Pid.PersistentIdView {
  return {
    kind: 'pid',
    provider: 'w3id',
    value: PID,
    state,
    document_id: 'dataset-1',
    job_id: null,
    failure: null,
    requested_at_ms: null,
    minted_at_ms: null,
    withdrawn_at_ms: null,
  }
}

const EmptyStub = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const FieldStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    })
  },
})

const PidWithdraw = compileClientComponent(new URL('./PidWithdraw.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogClose.vue': moduleDefault(Passthrough),
  '@/components/ui/Input.vue': moduleDefault(FieldStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Textarea.vue': moduleDefault(FieldStub),
  '@/composables/useAruna': {
    useAruna: () => ({
      apiBaseUrl: ref('https://api.example.test'),
      authToken: ref('token'),
      canWithdrawPids,
    }),
  },
  '@/lib/pid': { ...Pid, listPersistentIds, withdrawPid },
  '@/lib/utils': Utils,
})

function mount() {
  return mountApp(PidWithdraw, { props: { documentId: 'dataset-1' } })
}

function field(root: Parameters<typeof content>[0], id: string) {
  return element(root, (node) => node.props.id === id)
}

beforeEach(() => {
  canWithdrawPids.value = true
  listPersistentIds.mockReset().mockResolvedValue([view('active')])
  withdrawPid.mockReset().mockResolvedValue(undefined)
})

describe('PidWithdraw', () => {
  it('stays hidden without the permission', async () => {
    canWithdrawPids.value = false
    const mounted = await mount()
    await flush()

    expect(content(mounted.root)).toBe('')
    expect(listPersistentIds).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('stays hidden for a withdrawn identifier', async () => {
    listPersistentIds.mockResolvedValue([view('admin-withdrawn')])
    const mounted = await mount()
    await flush()

    expect(content(mounted.root)).toBe('')
    mounted.app.unmount()
  })

  it('offers an admin the active identifier', async () => {
    const mounted = await mount()
    await flush()

    const rendered = content(mounted.root)
    expect(rendered).toContain('Administration')
    expect(rendered).toContain(PID)
    expect(rendered).toContain('Active')
    expect(button(mounted.root, 'Withdraw PID')).toBeDefined()
    mounted.app.unmount()
  })

  it('confirms on the identifier and a reason', async () => {
    const mounted = await mount()
    await flush()
    await click(button(mounted.root, 'Withdraw PID'))
    const confirm = () => button(mounted.root, 'Withdraw permanently')

    expect(confirm().props.disabled).toBe(true)

    await typeValue(field(mounted.root, 'pid-withdraw-confirm'), PID)
    expect(confirm().props.disabled).toBe(true)

    await typeValue(field(mounted.root, 'pid-withdraw-reason'), 'Minted for the wrong dataset.')
    expect(confirm().props.disabled).toBe(false)

    await click(confirm())
    await flush()

    expect(withdrawPid).toHaveBeenCalledWith(
      'dataset-1',
      PID,
      'Minted for the wrong dataset.',
      { baseUrl: 'https://api.example.test', token: 'token' },
    )
    mounted.app.unmount()
  })
})
