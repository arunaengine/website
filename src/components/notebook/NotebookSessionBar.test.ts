import { computed, defineComponent, h, ref, type Component } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as ComputeAdmin from '@/lib/computeAdmin'
import * as NotebookDocument from '@/lib/notebook/document'
import * as NotebookRuntimes from '@/lib/notebook/runtimes'
import * as NotebookSubmit from '@/lib/notebook/submit'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  mountApp,
  moduleDefault,
  type HostNode,
} from '@/test/clientRender'
import type { NotebookAruna } from '@/lib/notebook/nbformat'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()),
  })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, variant: String, size: String },
  setup: (props, { attrs, slots }) => () =>
    h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
})
const SelectStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String, options: Array, ariaLabel: String, disabled: Boolean },
  setup: (props, { attrs }) => () =>
    h('select', {
      ...attrs,
      disabled: props.disabled,
      'aria-label': props.ariaLabel,
      value: props.modelValue,
      options: props.options,
    }),
})
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Number], disabled: Boolean },
  setup: (props, { attrs }) => () =>
    h('input', { ...attrs, disabled: props.disabled, value: props.modelValue }),
})

const meta: NotebookAruna = {
  version: 1,
  runtime: 'python-notebook',
  workspace_bucket: 'lab-data',
  group_id: 'group-1',
}

interface Context {
  notebook: Record<string, unknown>
  session: Record<string, unknown>
}

let context: Context

function fakeContext(overrides: { state?: Record<string, unknown> | null; running?: boolean } = {}): Context {
  const state = ref(overrides.state === undefined ? null : overrides.state)
  return {
    notebook: {
      name: computed(() => 'counts'),
      key: ref('notebooks/counts.ipynb'),
      meta: computed(() => meta),
      patchMeta: vi.fn(),
    },
    session: {
      state,
      kernel: ref('idle'),
      jobId: ref(overrides.running ? '01JOB' : ''),
      nodeId: ref(overrides.running ? 'node-a' : ''),
      starting: ref(false),
      ending: ref(false),
      error: ref(null),
      notice: ref(null),
      idlePickMs: ref(null),
      live: computed(() => (state.value as { state?: string } | null)?.state === 'ready'),
      ended: computed(() => (state.value as { state?: string } | null)?.state === 'ended'),
      running: computed(() => Boolean(overrides.running)),
      start: vi.fn(),
      end: vi.fn(),
      interrupt: vi.fn(),
    },
  }
}

let realmIdleMs: number | undefined = 1_800_000

let compiled: Component | null = null

function sessionBar(): Component {
  compiled ??= compileClientComponent(new URL('./NotebookSessionBar.vue', import.meta.url), {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => IconStub }),
    '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Input.vue': moduleDefault(InputStub),
    '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
    '@/components/ui/Select.vue': moduleDefault(SelectStub),
    '@/components/notebook/NotebookDependencies.vue': moduleDefault(Slotted('div')),
    '@/composables/notebookContext': { injectNotebook: () => context },
    '@/composables/useAruna': { useAruna: () => ({ myGroups: ref([{ id: 'group-1', name: 'Lab' }]) }) },
    '@/composables/useNow': { useNow: () => ref(1_000) },
    '@/composables/useComputeAdmin': {
      useComputeAdmin: () => ({
        getComputeConfig: async () => ({ session_idle_after_ms: realmIdleMs }),
      }),
    },
    '@/composables/useRealmNodes': {
      useRealmNodes: () => ({
        nodes: ref([{ nodeId: 'node-a', label: 'Node A', executorKinds: ['docker'] }]),
        displayName: () => 'Node A',
      }),
    },
    '@/lib/notebook/runtimes': NotebookRuntimes,
    '@/lib/notebook/document': NotebookDocument,
    '@/lib/notebook/submit': NotebookSubmit,
    '@/lib/computeAdmin': ComputeAdmin,
  })
  return compiled
}

async function render(overrides: Parameters<typeof fakeContext>[0] = {}) {
  context = fakeContext(overrides)
  const host = defineComponent({ setup: () => () => h(sessionBar()) })
  const { root } = await mountApp(host)
  return root
}

function select(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'select' && node.props['aria-label'] === label)
}

describe('the session bar', () => {
  it('offers Start while no session runs', async () => {
    const root = await render()
    expect(content(root)).toContain('No session')
    expect(button(root, 'Start').props.disabled).toBe(false)
  })

  it('starts a session with the notebook settings', async () => {
    const root = await render()
    const { start } = context.session as { start: ReturnType<typeof vi.fn> }
    await click(button(root, 'Start'))
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        runtime: 'python-notebook',
        workspaceBucket: 'lab-data',
        name: 'counts',
      }),
    )
  })

  it('shows the idle countdown from the session state', async () => {
    const root = await render({ state: { state: 'ready', idle_deadline_ms: 301_000, idle_after_ms: 1_800_000 } })
    expect(content(root)).toContain('Ready')
    expect(content(root)).toContain('5 min left')
  })

  it('offers End instead of Start while a session runs', async () => {
    const root = await render({ state: { state: 'ready', idle_deadline_ms: 0 }, running: true })
    expect(button(root, 'End')).toBeTruthy()
    expect(() => button(root, 'Start')).toThrow()
  })

  it('locks the idle pick while a session runs and hides the realm default', async () => {
    realmIdleMs = 1_800_000
    // The session picked a shorter timeout; the realm value is what counts.
    const root = await render({ state: { state: 'ready', idle_after_ms: 300_000 }, running: true })
    await click(button(root, 'Session'))
    const idle = select(root, 'Idle timeout')
    expect(idle.props.disabled).toBe(true)
    const labels = (idle.props.options as { label: string }[]).map((option) => option.label)
    expect(labels).toEqual(['Realm default', '5 minutes', '15 minutes'])
  })

  it('hides the value the compute config reports the compute config reports', async () => {
    realmIdleMs = 300_000
    const root = await render()
    await click(button(root, 'Session'))
    const labels = (select(root, 'Idle timeout').props.options as { label: string }[]).map(
      (option) => option.label,
    )
    expect(labels).toEqual(['Realm default', '15 minutes', '30 minutes'])
    realmIdleMs = 1_800_000
  })
})
