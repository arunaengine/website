import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createRenderer, defineComponent, h, nextTick, type App, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageResponse } from '@/lib/api'
import * as Quota from '@/lib/quota'
import * as Utils from '@/lib/utils'

// The cards read the shared composable, so the fetch mock sits one level down
// at the API call the composable makes.
const aruna = vi.hoisted(() => ({
  myGroups: { value: [] as Array<{ id: string; name: string }> },
  getGroupUsage: vi.fn<(groupId: string) => Promise<UsageResponse>>(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const MyGroupsUsage = await import('@/composables/useMyGroupsUsage')
const ReachableUsage = await import('@/composables/useReachableUsage')
const BucketCount = await import('@/composables/useBucketCount')
const Distribution = await import('@/lib/distribution')
const FormatCount = await import('@/lib/formatCount')
const { myGroups, getGroupUsage } = aruna

const SlotStub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const RouterLinkStub = defineComponent((_, { attrs, slots }) => () => h('a', attrs, slots.default?.()))
const SkeletonStub = defineComponent(() => () => h('span', 'loading'))
const ErrorPanelStub = defineComponent({
  props: { message: String },
  setup: (props) => () => h('div', props.message),
})

const moduleDefault = (component: Component) => ({ __esModule: true, default: component })
const icons = new Proxy({}, { get: () => SlotStub })

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

const GroupQuotaCards = compileClientComponent(new URL('./GroupQuotaCards.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(SlotStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/dashboard/GroupStorage.vue': moduleDefault(SlotStub),
  '@/components/ui/Skeleton.vue': moduleDefault(SkeletonStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(ErrorPanelStub),
  '@/composables/useMyGroupsUsage': MyGroupsUsage,
  '@/composables/useReachableUsage': ReachableUsage,
  '@/composables/useBucketCount': BucketCount,
  '@/lib/distribution': Distribution,
  '@/lib/formatCount': FormatCount,
  '@/lib/quota': Quota,
})

beforeEach(() => {
  myGroups.value = []
  getGroupUsage.mockReset()
})

const mountedApps: App<HostNode>[] = []
afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount()
  vi.unstubAllGlobals()
})

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
  if (child.parent) {
    const previous = child.parent.children.indexOf(child)
    if (previous >= 0) child.parent.children.splice(previous, 1)
  }
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
    return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
  },
  insertStaticContent(content, parent, anchor) {
    const node = hostNode('text', '', content)
    insert(node, parent, anchor)
    return [node, node]
  },
})

function content(node: HostNode): string {
  return `${node.text} ${node.children.map(content).join(' ')}`.replace(/\s+/g, ' ').trim()
}

async function flush() {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountCards(view: 'cards' | 'table' = 'cards'): { app: App<HostNode>; root: HostNode } {
  const root = hostNode('root')
  const app = renderer.createApp(GroupQuotaCards, { refreshRevision: 0, view })
  app.mount(root)
  mountedApps.push(app)
  return { app, root }
}

function usage(overrides: Partial<UsageResponse> = {}): UsageResponse {
  return {
    buckets: 1,
    objects: 2,
    stored_blobs: 3,
    stored_bytes: 4,
    logical_bytes: 5,
    referenced_bytes: 6,
    realm: {
      buckets: 1,
      objects: 2,
      stored_blobs: 3,
      stored_bytes: 4,
      logical_bytes: 5,
      referenced_bytes: 6,
    },
    ...overrides,
  }
}

describe('group purpose counts', () => {
  it('shows each group as a card with its counts in singular and plural', async () => {
    myGroups.value = [{ id: 'header-1', name: 'Research group' }]
    getGroupUsage.mockResolvedValue(usage({ dataset_count: 1, profile_count: 1, process_run_count: 3 }))
    const mounted = mountCards()

    await flush()
    const text = content(mounted.root)

    expect(text).toContain('Research group')
    expect(text).toContain('objects 2 bucket 1 dataset 1 runs 3')
  })

  it('shows the same figures as table rows when the table was chosen', async () => {
    myGroups.value = [{ id: 'table-1', name: 'Research group' }]
    getGroupUsage.mockResolvedValue(usage({ dataset_count: 4, profile_count: 0, process_run_count: 5 }))
    const mounted = mountCards('table')

    await flush()
    const text = content(mounted.root)

    expect(text).toContain('Group Storage Objects Buckets Datasets Runs')
    expect(text).toContain('Research group v-if 2 1 4 5')
  })

  it('badges a group near its quota and leaves an unlimited one plain', async () => {
    myGroups.value = [
      { id: 'near-1', name: 'Near' },
      { id: 'free-1', name: 'Free' },
    ]
    getGroupUsage.mockImplementation(async (groupId) =>
      groupId === 'near-1'
        ? usage({ quota: { quota_bytes: 6, ceiling_bytes: 12, warn_threshold_percent: 80, warning: true } })
        : usage({ quota: { quota_bytes: null, ceiling_bytes: null, warn_threshold_percent: 80, warning: false } }),
    )
    const mounted = mountCards()

    await flush()
    const text = content(mounted.root)

    expect(text).toContain('Near Near quota')
    expect(text).not.toContain('Unlimited')
  })

  it('renders null as unknown while preserving an explicit zero and exact count', async () => {
    myGroups.value = [{ id: 'counts-1', name: 'Research group' }]
    getGroupUsage.mockResolvedValue(
      usage({ dataset_count: null, profile_count: 0, process_run_count: 12 }),
    )
    const mounted = mountCards()

    await flush()
    const text = content(mounted.root)

    expect(text).toMatch(/datasets Unknown/)
    expect(text).toMatch(/runs 12/)
    expect(text).not.toContain('~12')
  })

  it('represents every membership while keeping at most three usage requests in flight', async () => {
    myGroups.value = Array.from({ length: 14 }, (_, index) => ({
      id: `group-${index + 1}`,
      name: `Group ${index + 1}`,
    }))
    let active = 0
    let maxActive = 0
    const pending: Array<() => void> = []
    getGroupUsage.mockImplementation(
      () =>
        new Promise((resolve) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          pending.push(() => {
            active -= 1
            resolve(usage({ dataset_count: 1, profile_count: 2, process_run_count: 3 }))
          })
        }),
    )
    const mounted = mountCards()

    await flush()
    expect(getGroupUsage).toHaveBeenCalledTimes(3)
    for (const group of myGroups.value) expect(content(mounted.root)).toContain(group.name)
    expect(content(mounted.root)).not.toContain('more groups')

    let guard = 0
    while ((getGroupUsage.mock.calls.length < myGroups.value.length || active > 0) && guard < 100) {
      pending.shift()?.()
      await flush()
      guard += 1
    }

    expect(getGroupUsage).toHaveBeenCalledTimes(myGroups.value.length)
    expect(maxActive).toBe(3)
  })

  it('keeps GroupDetail purpose counts on usage fields, not the approximate estimate', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../groups/GroupDetail.vue', import.meta.url)),
      'utf8',
    )
    const purposeBlock = source.match(/Live datasets[\s\S]*?<\/dl>/)?.[0] ?? ''

    expect(source).toContain("usage.value?.dataset_count")
    expect(source).toContain("usage.value?.profile_count")
    expect(source).toContain("usage.value?.process_run_count")
    expect(source).toContain("value == null ? 'Unknown'")
    expect(purposeBlock).not.toContain('docsEstimate')
  })
})
