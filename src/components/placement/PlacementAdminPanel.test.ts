import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createRenderer, defineComponent, h, nextTick, ref, type App, type Component } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, NO_MANAGEMENT_NODE_MESSAGE, apiErrorMessage, type RealmPlacementStrategy } from '@/lib/api'
import { placementMutationErrorMessage } from '@/composables/usePlacement'
import { useRefresh } from '@/composables/useRefresh'
import { refreshButton } from '@/test/clientRender'
import * as Placement from '@/lib/placement'
import type { RealmPlacementConfigResponse } from '@/lib/placement'

const familyId = '01J00000000000000000000000'
const otherId = '01J00000000000000000000001'

function strategy(strategyId: string, name: string): RealmPlacementStrategy {
  return {
    strategy_id: strategyId,
    name,
    replica_count: 3,
    distinct_locations: true,
    affinity: [],
    shard_count: 64,
  }
}

function placementConfig(defaultStrategyId: string): RealmPlacementConfigResponse {
  return {
    strategies: [strategy(familyId, 'Family records'), strategy(otherId, 'General records')],
    default_strategy_id: defaultStrategyId,
    job_family_strategy_id: familyId,
    bindings: [],
    overrides: [],
    transitions: { active: 0, incomplete_buckets: 0, stalled_buckets: 0, overdue: 0 },
  }
}

let response = placementConfig(familyId)
const busy = ref(false)
const getRealmPlacement = vi.fn(async () => structuredClone(response))
const mutateRealmPlacement = vi.fn()

const PassThroughStub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () =>
  h('button', attrs, slots.default?.()),
)
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const InputStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: [String, Number],
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue,
        disabled: props.disabled,
        onInput: (event: { target: { value: string } }) =>
          emit('update:modelValue', event.target.value),
      })
  },
})
const SelectStub = defineComponent({
  props: {
    modelValue: String,
    options: { type: Array, default: () => [] },
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  setup: (props) => () => h('select', { value: props.modelValue, disabled: props.disabled }),
})
const EmptyStateStub = defineComponent({
  props: { title: String, description: String },
  setup: (props) => () => h('div', `${props.title ?? ''}${props.description ?? ''}`),
})
const ErrorPanelStub = defineComponent({
  props: { message: String },
  setup: (props) => () => h('div', props.message),
})
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))
const icons = new Proxy({}, { get: () => PassThroughStub })
const moduleDefault = (component: Component) => ({ __esModule: true, default: component })

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

const StrategyEditor = compileClientComponent(new URL('./StrategyEditor.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Switch.vue': moduleDefault(PassThroughStub),
  '@/lib/placement': Placement,
  '@lucide/vue': icons,
})

const PlacementAdminPanel = compileClientComponent(
  new URL('./PlacementAdminPanel.vue', import.meta.url),
  {
    vue: VueRuntime,
    'vue-router': { RouterLink: RouterLinkStub },
    '@/components/storage/NodeAttributesSection.vue': moduleDefault(PassThroughStub),
    '@/components/placement/StrategyEditor.vue': moduleDefault(StrategyEditor),
    '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
    '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
    '@/components/ui/ErrorPanel.vue': moduleDefault(ErrorPanelStub),
    '@/components/ui/Input.vue': moduleDefault(InputStub),
    '@/components/ui/Select.vue': moduleDefault(SelectStub),
    '@/components/ui/Skeleton.vue': moduleDefault(PassThroughStub),
    '@/composables/useAruna': {
      useAruna: () => ({
        bootstrapped: ref(true),
        currentUser: ref({ user_id: 'admin' }),
        isRealmAdmin: ref(true),
        // The routes are relayed, so the panel serves any node kind.
        isManagementNode: ref(false),
        realmInfo: ref({ nodes: [] }),
      }),
    },
    '@/lib/api': { ApiError, apiErrorMessage },
    '@/composables/useRefresh': { useRefresh },
    '@/composables/usePlacement': {
      isPlacementUnsupported: () => false,
      placementMutationErrorMessage,
      usePlacement: () => ({
        placementAdminEnabled: ref(true),
        busy,
        getRealmPlacement,
        mutateRealmPlacement,
      }),
    },
    '@/lib/placement': Placement,
    '@lucide/vue': icons,
  },
)

type HostKind = 'root' | 'element' | 'text' | 'comment'
interface HostNode {
  kind: HostKind
  tag: string
  text: string
  props: Record<string, unknown>
  children: HostNode[]
  parent: HostNode | null
}

function hostNode(kind: HostKind, tag = '', text = ''): HostNode {
  return { kind, tag, text, props: {}, children: [], parent: null }
}

function insert(child: HostNode, parent: HostNode, anchor: HostNode | null = null) {
  child.parent = parent
  const index = anchor ? parent.children.indexOf(anchor) : -1
  if (index >= 0) parent.children.splice(index, 0, child)
  else parent.children.push(child)
}

const renderer = createRenderer<HostNode, HostNode>({
  patchProp(node, key, _previous, value) {
    node.props[key] = value
  },
  insert,
  remove(node) {
    if (!node.parent) return
    const index = node.parent.children.indexOf(node)
    if (index >= 0) node.parent.children.splice(index, 1)
    node.parent = null
  },
  createElement: (tag) => hostNode('element', tag),
  createText: (text) => hostNode('text', '', text),
  createComment: (text) => hostNode('comment', '', text),
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
    node.children = []
  },
  parentNode: (node) => node.parent,
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

function button(root: HostNode, label: string): HostNode {
  const match = nodes(root).find(
    (node) => node.kind === 'element' && node.tag === 'button' && content(node).trim() === label,
  )
  if (!match) throw new Error(`Expected ${label} button to be rendered`)
  return match
}

async function mountPanel(defaultStrategyId: string) {
  response = placementConfig(defaultStrategyId)
  busy.value = false
  const root = hostNode('root')
  const app: App<HostNode> = renderer.createApp(PlacementAdminPanel)
  const errors: unknown[] = []
  app.config.errorHandler = (error) => errors.push(error)
  app.mount(root)
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
  return { app, root, errors }
}

describe('record placement on a node that is not a management node', () => {
  it('renders the rule form', async () => {
    // The backend relays the placement routes, so the panel no longer asks
    // which kind of node serves it.
    const mounted = await mountPanel(familyId)

    expect(content(mounted.root)).toContain('Record placement rules')
    expect(button(mounted.root, 'Remove rule')).toBeDefined()
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('reports an unreachable management node', async () => {
    getRealmPlacement.mockRejectedValueOnce(
      new ApiError(503, 'No management node is reachable', 'no_management_node'),
    )
    const mounted = await mountPanel(familyId)

    expect(content(mounted.root)).toContain(NO_MANAGEMENT_NODE_MESSAGE)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})

describe('record placement run family controls', () => {
  it('badges the run family rule and explains its immutable role', async () => {
    const mounted = await mountPanel(familyId)

    expect(content(mounted.root)).toContain('Run family')
    expect(content(mounted.root)).toContain(
      'Places run family records. It cannot be removed, and its shard count is frozen.',
    )
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('disables removal for the run family rule and allows it for another', async () => {
    const family = await mountPanel(familyId)
    expect(button(family.root, 'Remove rule').props.disabled).toBe(true)
    family.app.unmount()

    const other = await mountPanel(otherId)
    expect(button(other.root, 'Remove rule').props.disabled).toBe(false)
    expect(other.errors).toEqual([])
    other.app.unmount()
  })

  it('locks the shard count while the run family rule is edited', async () => {
    const mounted = await mountPanel(familyId)
    const shardCount = nodes(mounted.root).find(
      (node) => node.kind === 'element' && node.tag === 'input' && node.props.max === '4096',
    )

    expect(shardCount?.props.disabled).toBe(true)
    expect(content(mounted.root)).toContain('Frozen for the run family.')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('maps the protected and referenced strategy conflicts to specific messages', () => {
    expect(
      placementMutationErrorMessage(
        new ApiError(409, `placement strategy ${familyId} is the immutable job-family strategy`),
      ),
    ).toContain('shard count is frozen')
    expect(
      placementMutationErrorMessage(
        new ApiError(409, `placement strategy ${otherId} is currently referenced`),
      ),
    ).toContain('Remove or update its references first')
  })
})
