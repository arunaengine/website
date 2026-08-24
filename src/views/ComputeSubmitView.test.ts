import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createRenderer, defineComponent, h, nextTick, ref, type App, type Component } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import * as VueUse from '@vueuse/core'
import * as Api from '@/lib/api'
import * as NodeDisplay from '@/components/nodes/node-display'
import * as OnboardingConfig from '@/lib/onboarding-config'
import * as Jobs from '@/lib/jobs'
import * as NativeSubmit from '@/lib/nativeSubmit'
import * as PlacementPolicies from '@/lib/placementPolicies'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import * as Workspaces from '@/lib/workspaces'

vi.stubGlobal('Document', class {})
vi.stubGlobal('ShadowRoot', class {})

const GenericStub = defineComponent(() => () => h('div'))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('select', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value)),
    })
  },
})
const SwitchStub = defineComponent((_, { attrs }) => () => h('input', { ...attrs, type: 'checkbox' }))
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup(props, { slots }) {
    return () => h('header', [h('h1', props.title), h('p', props.description), slots.actions?.()])
  },
})
const WizardStepsStub = defineComponent({
  props: { steps: { type: Array, default: () => [] } },
  setup(props) {
    return () => h('nav', props.steps.map((step) => h('span', String(step))))
  },
})
const ExecutorStub = defineComponent({
  props: { modelValue: { type: Array, required: true } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const initial = props.modelValue[0] as { image?: string; command?: string[] } | undefined
    const image = ref(initial?.image ?? '')
    const commandLine = ref(initial?.command?.join(' ') ?? '')
    const update = () =>
      emit('update:modelValue', [
        { image: image.value, command: commandLine.value.trim() ? commandLine.value.trim().split(/\s+/) : [] },
      ])
    return () =>
      h('div', [
        h('input', {
          placeholder: 'ubuntu:22.04',
          value: image.value,
          onInput: (event: { target: { value: unknown } }) => {
            image.value = String(event.target.value)
            update()
          },
        }),
        h('input', {
          'aria-label': 'Command line',
          value: commandLine.value,
          onInput: (event: { target: { value: unknown } }) => {
            commandLine.value = String(event.target.value)
            update()
          },
        }),
      ])
  },
})
const TaskJsonPreviewStub = defineComponent({
  props: { title: { type: String, required: true }, task: { type: Object, required: true } },
  setup(props) {
    return () => h('section', [h('h2', props.title), h('pre', JSON.stringify(props.task, null, 2))])
  },
})
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const KindSelectStub = defineComponent({
  props: { options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        (props.options as Array<{ value: string; title: string }>).map((option) =>
          h('button', { onClick: () => emit('update:modelValue', option.value) }, option.title),
        ),
      )
  },
})
const SecretPanelStub = defineComponent({
  props: { secret: String },
  setup: (props) => () => h('div', props.secret),
})
const CodeSnippetStub = defineComponent({
  props: { title: String, code: String },
  setup: (props) => () => h('section', [h('h2', props.title), h('pre', props.code)]),
})
const EmptyStateStub = defineComponent({
  props: { title: String },
  setup: (props) => () => h('div', props.title),
})

const useArunaModule = {
  useAruna: () => ({
    apiBaseUrl: ref('https://node.example.org/api/v1'),
    bootstrapped: ref(true),
    currentUser: ref({ id: 'user-id', display_name: 'Test User' }),
    myGroups: ref([{ id: 'group-id', name: 'Test Group' }]),
    canManageOnboarding: ref(true),
    isManagementNode: ref(true),
    nodeInfo: ref({
      node: { peer_id: 'node-id', capabilities: 'management' },
      services: { interfaces: { rest: { url: 'https://node.example.org/api/v1' } } },
    }),
    realmInfo: ref({
      nodes: [{ node_id: 'node-id', kind: 'management', info: { urls: { api: 'https://node.example.org/api/v1' } } }],
    }),
  }),
}
const useNodeOnboardingModule = {
  NEVER_EXPIRES_AFTER: 10_000_000_000,
  secretStatus: () => 'outstanding',
  useNodeOnboarding: () => ({
    secrets: ref([]),
    listError: ref(null),
    minting: ref(false),
    mintError: ref(null),
    revokingIds: ref(new Set<string>()),
    watch: ref({
      phase: 'idle',
      enrollmentId: null,
      claimedBy: null,
      claimedIsNode: false,
      lastError: null,
    }),
    refreshSecrets: vi.fn(async () => undefined),
    mint: vi.fn(async () => ({
      response: { onboarding_secret: 'test-secret', expires_at: 4_000_000_000, mode: 'Management' },
      enrollmentId: 'enrollment-id',
    })),
    revoke: vi.fn(),
    startWatch: vi.fn(),
    resetWatch: vi.fn(),
  }),
}
const icons = new Proxy({}, { get: () => GenericStub })
const moduleDefault = (component: Component) => ({ __esModule: true, default: component })

// Vitest runs this repository in SSR mode and there is no DOM test dependency.
// Compile only the three SFCs under test for the small in-memory client renderer.
function compileClientComponent(url: URL, modules: Record<string, unknown>): Component {
  const source = readFileSync(url, 'utf8')
  const { descriptor } = parse(source, { filename: url.pathname })
  if (!descriptor.template) throw new Error(`Missing template in ${url.pathname}`)
  const script = compileScript(descriptor, { id: url.pathname, inlineTemplate: false })
  const scriptJavascript = transpileModule(script.content, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText
  const cjs = { exports: {} as Record<string, unknown> }
  const localRequire = (id: string) => {
    if (!(id in modules)) throw new Error(`Missing test module ${id} for ${url.pathname}`)
    return modules[id]
  }
  new Function('require', 'exports', 'module', scriptJavascript)(localRequire, cjs.exports, cjs)
  const component = cjs.exports.default as Component
  const { code } = compile(descriptor.template.content, {
    mode: 'function',
    prefixIdentifiers: true,
    bindingMetadata: script.bindings,
  })
  const renderJavascript = transpileModule(code, {
    compilerOptions: { module: ModuleKind.None, target: ScriptTarget.ES2022 },
  }).outputText
  Object.assign(component, { render: new Function('Vue', renderJavascript)(VueRuntime) })
  return component
}

const Input = compileClientComponent(new URL('../components/ui/Input.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
  '@vueuse/core': VueUse,
})
const sharedComponents = {
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/Skeleton.vue': moduleDefault(GenericStub),
  '@/components/onboarding/WizardSteps.vue': moduleDefault(WizardStepsStub),
}
const ComputeSubmitView = compileClientComponent(new URL('./ComputeSubmitView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...sharedComponents,
  '@/components/ui/Textarea.vue': moduleDefault(GenericStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/compute/TaskJsonPreview.vue': moduleDefault(TaskJsonPreviewStub),
  '@/components/compute/ExecutorStepsEditor.vue': moduleDefault(ExecutorStub),
  '@/components/compute/TesInputsEditor.vue': moduleDefault(GenericStub),
  '@/components/compute/TesDataRefDialog.vue': moduleDefault(GenericStub),
  '@/components/compute/ContainerFsTree.vue': moduleDefault(GenericStub),
  '@/composables/useTes': {
    isTesUnsupported: () => false,
    useTes: () => ({
      tesEnabled: ref(true),
      busy: ref(false),
      createTask: vi.fn(async () => ({ id: 'task-id' })),
      getTask: vi.fn(),
    }),
  },
  '@/composables/useAruna': useArunaModule,
  '@/composables/useAuth': {
    useAuth: () => ({ stage: ref('authenticated'), authPending: ref(false), signIn: vi.fn() }),
  },
  '@/composables/useComputeDataView': { useComputeDataView: () => ref('table') },
  '@/composables/useS3': {
    useS3: () => ({ hasActiveKey: ref(false), endpoint: ref(null), listBuckets: vi.fn(async () => []) }),
  },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ executorKinds: ref(['docker']) }),
  },
  '@/lib/tes': Tes,
  '@/lib/workspaces': Workspaces,
  // Real modules: the TES-versus-native switch is the behaviour under test.
  '@/lib/nativeSubmit': NativeSubmit,
  '@/lib/jobs': Jobs,
  '@/lib/placementPolicies': PlacementPolicies,
})
const AdminOnboardingView = compileClientComponent(new URL('./AdminOnboardingView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...sharedComponents,
  '@/components/ui/ErrorPanel.vue': moduleDefault(GenericStub),
  '@/components/onboarding/KindSelectStep.vue': moduleDefault(KindSelectStub),
  '@/components/onboarding/SecretPanel.vue': moduleDefault(SecretPanelStub),
  '@/components/onboarding/CodeSnippet.vue': moduleDefault(CodeSnippetStub),
  '@/components/onboarding/ClaimWatchStep.vue': moduleDefault(GenericStub),
  '@/components/onboarding/DeviceLane.vue': moduleDefault(GenericStub),
  '@/components/onboarding/SecretsTable.vue': moduleDefault(GenericStub),
  '@/composables/useAruna': useArunaModule,
  '@/composables/useNodeOnboarding': useNodeOnboardingModule,
  '@/lib/onboarding-config': OnboardingConfig,
  '@/components/nodes/node-display': NodeDisplay,
  '@/lib/utils': Utils,
  '@/lib/api': Api,
})

type HostKind = 'root' | 'element' | 'text' | 'comment'

interface HostNode {
  kind: HostKind
  tag: string
  text: string
  value: unknown
  props: Record<string, unknown>
  children: HostNode[]
  parent: HostNode | null
  listeners: Map<string, Set<(event: { target: HostNode }) => void>>
  addEventListener: (type: string, listener: (event: { target: HostNode }) => void) => void
  removeEventListener: (type: string, listener: (event: { target: HostNode }) => void) => void
  getRootNode: () => HostNode
  focus: () => void
}

function hostNode(kind: HostKind, tag = '', text = ''): HostNode {
  const node: HostNode = {
    kind,
    tag,
    text,
    value: '',
    props: {},
    children: [],
    parent: null,
    listeners: new Map(),
    addEventListener(type, listener) {
      const listeners = node.listeners.get(type) ?? new Set()
      listeners.add(listener)
      node.listeners.set(type, listeners)
    },
    removeEventListener(type, listener) {
      node.listeners.get(type)?.delete(listener)
    },
    getRootNode() {
      let root = node
      while (root.parent) root = root.parent
      return root
    },
    focus() {},
  }
  return node
}

function insert(child: HostNode, parent: HostNode, anchor: HostNode | null = null) {
  if (child.parent) {
    const oldIndex = child.parent.children.indexOf(child)
    if (oldIndex >= 0) child.parent.children.splice(oldIndex, 1)
  }
  child.parent = parent
  const index = anchor ? parent.children.indexOf(anchor) : -1
  if (index >= 0) parent.children.splice(index, 0, child)
  else parent.children.push(child)
}

const renderer = createRenderer<HostNode, HostNode>({
  patchProp(node, key, _previous, value) {
    node.props[key] = value
    if (key === 'value') node.value = value
    else if (key === 'type') Object.assign(node, { type: value })
  },
  insert,
  remove(node) {
    if (!node.parent) return
    const index = node.parent.children.indexOf(node)
    if (index >= 0) node.parent.children.splice(index, 1)
    node.parent = null
  },
  createElement(tag) {
    return hostNode('element', tag)
  },
  createText(text) {
    return hostNode('text', '', text)
  },
  createComment(text) {
    return hostNode('comment', '', text)
  },
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
    node.children = []
  },
  parentNode(node) {
    return node.parent
  },
  nextSibling(node) {
    if (!node.parent) return null
    const index = node.parent.children.indexOf(node)
    return node.parent.children[index + 1] ?? null
  },
  insertStaticContent(content, parent, anchor) {
    const node = hostNode('text', '', content)
    insert(node, parent, anchor)
    return [node, node]
  },
})

function nodes(root: HostNode): HostNode[] {
  return [root, ...root.children.flatMap(nodes)]
}

function content(node: HostNode): string {
  return `${node.text}${node.children.map(content).join('')}`
}

function element(root: HostNode, predicate: (node: HostNode) => boolean): HostNode {
  const match = nodes(root).find((node) => node.kind === 'element' && predicate(node))
  if (!match) throw new Error('Expected element was not rendered')
  return match
}

function input(root: HostNode, key: string, value: unknown): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props[key] === value)
}

function button(root: HostNode, label: string): HostNode {
  return element(root, (node) => {
    const text = content(node).trim()
    return node.tag === 'button' && (text === label || text.startsWith(label))
  })
}

// The submit button's label follows the submission surface it will use; these
// tests are about validity gating, not about which surface was picked.
function submitButton(root: HostNode): HostNode {
  return element(root, (node) => {
    const text = content(node).trim()
    return node.tag === 'button' && (text.startsWith('Submit task') || text.startsWith('Submit job'))
  })
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function typeValue(node: HostNode, value: string) {
  node.value = value
  for (const listener of node.listeners.get('input') ?? []) listener({ target: node })
  if (typeof node.props.onInput === 'function') node.props.onInput({ target: node })
  await flush()
}

async function click(node: HostNode) {
  const handler = node.props.onClick
  if (typeof handler === 'function') await handler({ target: node })
  else if (Array.isArray(handler)) await Promise.all(handler.map((entry) => entry({ target: node })))
  await flush()
}

interface Mounted {
  app: App<HostNode>
  root: HostNode
  router?: Router
  errors: unknown[]
}

async function mount(component: Component, path?: string): Promise<Mounted> {
  const root = hostNode('root')
  const app = renderer.createApp(component)
  const errors: unknown[] = []
  app.config.errorHandler = (error) => errors.push(error)
  let router: Router | undefined
  if (path) {
    const Stub = defineComponent(() => () => h('div'))
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/app/compute', name: 'compute', component: Stub },
        { path: '/app/compute/new', name: 'compute-new', component: Stub },
        { path: '/app/compute/:taskId', name: 'compute-task', component: Stub },
        { path: '/app/admin', name: 'admin', component: Stub },
      ],
    })
    await router.push(path)
    await router.isReady()
    app.use(router)
  }
  app.mount(root)
  await flush()
  return { app, root, router, errors }
}

async function fillValidWorkload(root: HostNode) {
  await typeValue(input(root, 'placeholder', 'ubuntu:22.04'), 'alpine:3.20')
  await typeValue(input(root, 'aria-label', 'Command line'), 'echo hello')
  await typeValue(input(root, 'aria-label', 'Container path to capture'), '/outputs/result.txt')
  await typeValue(input(root, 'aria-label', 'Destination bucket'), 'results')
  await typeValue(input(root, 'aria-label', 'Destination key'), 'runs/result.txt')
  await click(button(root, 'Temporary workspace'))
  await typeValue(input(root, 'placeholder', '1'), '4')
  await typeValue(input(root, 'placeholder', '2'), '8.5')
  await typeValue(input(root, 'placeholder', '10'), '20.25')
}

describe('numeric Input consumers', () => {
  it('documents that type="number" Input values are emitted as numbers', async () => {
    let emitted: string | number | undefined
    const Harness = defineComponent(() => {
      const value = ref<string | number>('')
      return () =>
        h(Input, {
          modelValue: value.value,
          'onUpdate:modelValue': (next: string | number) => {
            value.value = next
            emitted = next
          },
          type: 'number',
          placeholder: 'numeric-contract',
        })
    })
    const mounted = await mount(Harness)

    await typeValue(input(mounted.root, 'placeholder', 'numeric-contract'), '12.5')

    expect(emitted).toBe(12.5)
    expect(typeof emitted).toBe('number')
    mounted.app.unmount()
  })

  it('renders Review with typed CPU, RAM, and Disk numbers without an exception', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?step=1')
    await fillValidWorkload(mounted.root)

    expect(button(mounted.root, 'Continue').props.disabled).toBe(true)
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()
    expect(submitButton(mounted.root).props.disabled).toBe(true)

    await mounted.router!.push('/app/compute/new')
    await flush()
    await typeValue(element(mounted.root, (node) => node.tag === 'select'), 'group-id')
    await mounted.router!.push('/app/compute/new?step=1')
    await flush()

    expect(button(mounted.root, 'Continue').props.disabled).toBe(false)
    await click(button(mounted.root, 'Continue'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(content(mounted.root)).toContain('TES task request')
    expect(content(mounted.root)).toContain('"cpu_cores": 4')
    expect(content(mounted.root)).toContain('"ram_gb": 8.5')
    expect(content(mounted.root)).toContain('"disk_gb": 20.25')
    expect(nodes(mounted.root).some((node) => node.props['aria-label'] === 'Command line')).toBe(false)
    expect(submitButton(mounted.root).props.disabled).toBe(false)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('keeps invalid resource values blocked after direct Review navigation', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?step=1')
    await fillValidWorkload(mounted.root)
    await typeValue(input(mounted.root, 'placeholder', '1'), '4294967296')
    await typeValue(input(mounted.root, 'placeholder', '2'), '0.0000000001')
    await typeValue(input(mounted.root, 'placeholder', '10'), '9223372036.854776')

    expect(button(mounted.root, 'Continue').props.disabled).toBe(true)
    expect(content(mounted.root)).toContain('Enter a whole number of at least 1.')
    expect(content(mounted.root)).toContain('Must be greater than zero.')

    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(submitButton(mounted.root).props.disabled).toBe(true)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('rechecks executor and output validity on a directly reached Review step', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?step=1')
    await click(button(mounted.root, 'Temporary workspace'))
    await typeValue(input(mounted.root, 'placeholder', '1'), '1')
    await typeValue(input(mounted.root, 'placeholder', '2'), '1')
    await typeValue(input(mounted.root, 'placeholder', '10'), '1')
    await typeValue(input(mounted.root, 'placeholder', 'ubuntu:22.04'), 'alpine:3.20')
    await typeValue(input(mounted.root, 'aria-label', 'Command line'), 'echo hello')

    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(submitButton(mounted.root).props.disabled).toBe(true)

    await mounted.router!.push('/app/compute/new?step=1')
    await flush()
    await typeValue(input(mounted.root, 'aria-label', 'Destination bucket'), 'results')
    await typeValue(input(mounted.root, 'aria-label', 'Destination key'), 'runs/result.txt')
    await typeValue(input(mounted.root, 'aria-label', 'Command line'), '')
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(submitButton(mounted.root).props.disabled).toBe(true)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('picks the native jobs API only for options TES cannot carry', async () => {
    const mounted = await mount(ComputeSubmitView, '/app/compute/new?step=1')
    await click(button(mounted.root, 'Keep workspace'))
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(content(mounted.root)).toContain('POST /ga4gh/tes/v1/tasks')
    expect(content(mounted.root)).not.toContain("Aruna's native jobs API")

    await mounted.router!.push('/app/compute/new?step=1')
    await flush()
    await click(button(mounted.root, 'Temporary workspace'))
    await mounted.router!.push('/app/compute/new?step=2')
    await flush()

    expect(content(mounted.root)).toContain('POST /jobs/')
    expect(content(mounted.root)).toContain("Aruna's native jobs API")
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('renders Admin Onboarding snippets after typing a numeric weight', async () => {
    const mounted = await mount(AdminOnboardingView, '/app/admin')
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).includes('server for my realm')))
    await click(button(mounted.root, 'Continue'))
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).includes('Management')))
    await click(button(mounted.root, 'Continue'))
    await click(button(mounted.root, 'Mint secret'))
    await click(button(mounted.root, 'Continue to configuration'))

    await typeValue(input(mounted.root, 'placeholder', '1'), '7.5')

    expect(content(mounted.root)).toContain('ARUNA_NODE_WEIGHT=7.5')
    expect(content(mounted.root)).toContain('ARUNA_NODE_WEIGHT: "7.5"')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
