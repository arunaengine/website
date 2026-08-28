import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createRenderer, defineComponent, h, nextTick, ref, type App, type Component, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const SpinnerStub = defineComponent((_, { attrs }) => () => h('span', attrs, 'Searching…'))
const SelectStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] } },
  setup(props, { attrs }) {
    return () => h('select', attrs, (props.options as Array<{ value: string; label: string }>).map((option) =>
      h('option', { value: option.value }, option.label),
    ))
  },
})
const IconStub = defineComponent(() => () => h('svg'))
const icons = new Proxy({}, { get: () => IconStub })
const moduleDefault = (component: Component) => ({ __esModule: true, default: component })

const narrow = ref(true)
const authToken = ref<string | null>('token-a')
const mediaQuery = vi.fn(() => narrow)
const routerPush = vi.fn()
let configuredObjectMode: Ref<string> | undefined
const search = {
  documents: ref<Array<Record<string, unknown>>>([]),
  groups: ref<Array<Record<string, unknown>>>([]),
  users: ref<Array<Record<string, unknown>>>([]),
  objects: ref<Array<Record<string, unknown>>>([]),
  objectCoverage: ref<Record<string, unknown> | null>(null),
  objectError: ref<string | null>(null),
  objectSearched: ref(false),
  pending: ref(false),
  searched: ref(false),
  error: ref<string | null>(null),
  complete: ref(true),
  objectCursor: ref<string | null>(null),
  loadingSection: ref<string | null>(null),
  loadMore: vi.fn(),
  retry: vi.fn(),
}

function compileClientComponent(url: URL, modules: Record<string, unknown>) {
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
  return { component, exports: cjs.exports }
}

const OBJECT_SEARCH_MODE_LABELS = {
  local: 'Local',
  distributed_best_effort: 'Distributed best-effort',
  distributed_strict: 'Distributed strict',
}

const coverageIcon = compileClientComponent(
  new URL('../search/CoverageIcon.vue', import.meta.url),
  { vue: VueRuntime, '@lucide/vue': icons },
).component

const compiled = compileClientComponent(new URL('./SearchOverlay.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/search/CoverageIcon.vue': moduleDefault(coverageIcon),
  'vue-router': { useRouter: () => ({ push: routerPush }) },
  '@vueuse/core': { useMediaQuery: mediaQuery },
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/composables/useAruna': { useAruna: () => ({ authToken }) },
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ shortName: 'Test realm' }) }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      displayName: (nodeId: string) => nodeId === 'node-b' ? 'Storage node B' : nodeId,
      isLocalNode: (nodeId: string) => nodeId === 'node-a',
    }),
  },
  '@/lib/utils': {
    relativeTime: (value: string) => `relative ${value}`,
    truncateMiddle: (value: string) => value,
  },
  '@/composables/useUnifiedSearch': {
    DEFAULT_OBJECT_SEARCH_MODE: 'distributed_best_effort',
    OBJECT_SEARCH_MODE_LABELS,
    coverageComplete: (coverage: { complete?: boolean; truncated?: boolean } | null) =>
      Boolean(coverage?.complete && !coverage.truncated),
    useUnifiedSearch: (_query: unknown, config: { objectMode?: Ref<string> }) => {
      configuredObjectMode = config.objectMode
      return search
    },
  },
})
const SearchOverlay = compiled.component
const TOP_BAR_SEARCH_COLLAPSE_PX = compiled.exports.TOP_BAR_SEARCH_COLLAPSE_PX as number

type HostKind = 'root' | 'element' | 'text' | 'comment'

interface HostNode {
  kind: HostKind
  tag: string
  text: string
  value: unknown
  props: Record<string, unknown>
  style: { display: string }
  children: HostNode[]
  parent: HostNode | null
  listeners: Map<string, Set<(event: unknown) => void>>
  addEventListener: (type: string, listener: (event: unknown) => void) => void
  removeEventListener: (type: string, listener: (event: unknown) => void) => void
  focus: () => void
  contains: (candidate: unknown) => boolean
  querySelectorAll: (selector: string) => HostNode[]
}

let activeElement: HostNode | null = null

function descendants(node: HostNode): HostNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)])
}

function isFocusable(node: HostNode) {
  if (node.kind !== 'element' || node.props.disabled || node.props.tabindex === '-1') return false
  return node.tag === 'button' || node.tag === 'input' || node.tag === 'select' || node.tag === 'textarea'
    || (node.tag === 'a' && Boolean(node.props.href))
    || node.props.tabindex !== undefined
}

function hostNode(kind: HostKind, tag = '', text = ''): HostNode {
  const node: HostNode = {
    kind,
    tag,
    text,
    value: '',
    props: {},
    style: { display: '' },
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
    focus: () => {
      activeElement = node
    },
    contains: (candidate) => candidate === node || descendants(node).includes(candidate as HostNode),
    querySelectorAll: () => descendants(node).filter(isFocusable),
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

const teleportBody = hostNode('root', 'body')
const renderer = createRenderer<HostNode, HostNode>({
  patchProp(node, key, _previous, value) {
    node.props[key] = value
    if (key === 'value') node.value = value
    if (key === 'style' && value && typeof value === 'object') Object.assign(node.style, value)
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
  parentNode: (node) => node.parent,
  nextSibling(node) {
    if (!node.parent) return null
    const index = node.parent.children.indexOf(node)
    return node.parent.children[index + 1] ?? null
  },
  querySelector: (selector) => (selector === 'body' ? teleportBody : null),
  insertStaticContent(content, parent, anchor) {
    const node = hostNode('text', '', content)
    insert(node, parent, anchor)
    return [node, node]
  },
})

function content(node: HostNode): string {
  return `${node.text}${node.children.map(content).join('')}`
}

function allNodes(root: HostNode): HostNode[] {
  return [root, ...descendants(root), ...descendants(teleportBody)]
}

function findElement(root: HostNode, predicate: (node: HostNode) => boolean): HostNode | undefined {
  return allNodes(root).find((node) => node.kind === 'element' && predicate(node))
}

function indexOf(root: HostNode, predicate: (node: HostNode) => boolean): number {
  return allNodes(root).findIndex(predicate)
}

function element(root: HostNode, predicate: (node: HostNode) => boolean): HostNode {
  const match = findElement(root, predicate)
  if (!match) throw new Error('Expected element was not rendered')
  return match
}

function callHandler(handler: unknown, event: unknown) {
  if (typeof handler === 'function') return handler(event)
  if (Array.isArray(handler)) return Promise.all(handler.map((entry) => entry(event)))
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function click(node: HostNode) {
  await callHandler(node.props.onClick, { currentTarget: node, target: node })
  await flush()
}

async function inputValue(node: HostNode, value: string) {
  node.value = value
  await callHandler(node.props.onInput, { target: node })
  await callHandler(node.props['onUpdate:modelValue'], value)
  await flush()
}

async function keydown(node: HostNode, key: string, shiftKey = false) {
  let stopped = false
  const event = {
    key,
    shiftKey,
    preventDefault: vi.fn(),
    stopPropagation: () => {
      stopped = true
    },
  }
  let current: HostNode | null = node
  while (current && !stopped) {
    await callHandler(current.props.onKeydown, event)
    current = current.parent
  }
  await flush()
  return event
}

async function focusout(node: HostNode, relatedTarget: unknown) {
  let current: HostNode | null = node
  while (current) {
    await callHandler(current.props.onFocusout, { relatedTarget })
    current = current.parent
  }
  await flush()
}

interface Mounted {
  app: App<HostNode>
  root: HostNode
  errors: unknown[]
  dispatchPopstate: () => void
  history: { pushed: number; backed: number }
}

async function mount(): Promise<Mounted> {
  const listeners = new Set<() => void>()
  const history = {
    state: { route: 'current' } as unknown,
    pushed: 0,
    backed: 0,
    pushState(state: unknown) {
      history.state = state
      history.pushed++
    },
    back() {
      history.backed++
      for (const listener of listeners) listener()
    },
  }
  const testWindow = {
    history,
    addEventListener(type: string, listener: () => void) {
      if (type === 'popstate') listeners.add(listener)
    },
    removeEventListener(type: string, listener: () => void) {
      if (type === 'popstate') listeners.delete(listener)
    },
  }
  vi.stubGlobal('window', testWindow)
  vi.stubGlobal('document', {
    get activeElement() {
      return activeElement
    },
  })

  const root = hostNode('root')
  const app: App<HostNode> = renderer.createApp(SearchOverlay)
  const errors: unknown[] = []
  app.config.errorHandler = (error) => errors.push(error)
  app.mount(root)
  await flush()
  return {
    app,
    root,
    errors,
    dispatchPopstate: () => {
      for (const listener of listeners) listener()
    },
    history,
  }
}

function resetSearch() {
  search.documents.value = []
  search.groups.value = []
  search.users.value = []
  search.objects.value = []
  search.objectCoverage.value = null
  search.objectError.value = null
  search.objectSearched.value = false
  search.pending.value = false
  search.searched.value = false
  search.error.value = null
  search.complete.value = true
  search.objectCursor.value = null
  search.loadingSection.value = null
  search.loadMore.mockReset()
  search.retry.mockReset()
  configuredObjectMode = undefined
}

beforeEach(() => {
  teleportBody.children = []
  activeElement = null
  narrow.value = true
  authToken.value = 'token-a'
  mediaQuery.mockClear()
  routerPush.mockReset()
  resetSearch()
})

describe('narrow TopBar search panel', () => {
  it('renders the compact trigger below the measured breakpoint and keeps the narrow input padding responsive', async () => {
    const mounted = await mount()

    expect(TOP_BAR_SEARCH_COLLAPSE_PX).toBe(480)
    expect(mediaQuery).toHaveBeenCalledWith(`(max-width: ${TOP_BAR_SEARCH_COLLAPSE_PX - 0.02}px)`)
    expect(findElement(mounted.root, (node) => node.props['aria-label'] === 'Open global search')).toBeDefined()
    expect(findElement(mounted.root, (node) => node.tag === 'input')).toBeUndefined()

    narrow.value = false
    await flush()
    const input = element(mounted.root, (node) => node.tag === 'input')
    expect(input.props.class).toContain('pr-8')
    expect(input.props.class).toContain('sm:pr-16')
    expect(findElement(mounted.root, (node) => node.props['aria-label'] === 'Open global search')).toBeUndefined()
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('focuses the panel input when opened', async () => {
    const mounted = await mount()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Open global search'))

    const input = element(mounted.root, (node) => node.tag === 'input')
    expect(activeElement).toBe(input)
    expect(mounted.history.pushed).toBe(1)
    expect(element(mounted.root, (node) => node.props.role === 'dialog')).toBeDefined()
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    const mounted = await mount()
    const trigger = element(mounted.root, (node) => node.props['aria-label'] === 'Open global search')
    await click(trigger)
    await keydown(element(mounted.root, (node) => node.tag === 'input'), 'Escape')

    expect(findElement(mounted.root, (node) => node.props.role === 'dialog')).toBeUndefined()
    expect(activeElement).toBe(trigger)
    expect(mounted.history.backed).toBe(1)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('closes from the close button and restores focus to the trigger', async () => {
    const mounted = await mount()
    const trigger = element(mounted.root, (node) => node.props['aria-label'] === 'Open global search')
    await click(trigger)
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Close global search'))

    expect(findElement(mounted.root, (node) => node.props.role === 'dialog')).toBeUndefined()
    expect(activeElement).toBe(trigger)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('closes on popstate before the page can leave', async () => {
    const mounted = await mount()
    const trigger = element(mounted.root, (node) => node.props['aria-label'] === 'Open global search')
    await click(trigger)
    mounted.dispatchPopstate()
    await flush()

    expect(findElement(mounted.root, (node) => node.props.role === 'dialog')).toBeUndefined()
    expect(activeElement).toBe(trigger)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('traps Tab within the open panel', async () => {
    const mounted = await mount()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Open global search'))
    const input = element(mounted.root, (node) => node.tag === 'input')
    const close = element(mounted.root, (node) => node.props['aria-label'] === 'Close global search')

    await keydown(input, 'Tab', true)
    expect(activeElement).toBe(close)
    await keydown(close, 'Tab')
    expect(activeElement).toBe(input)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('keeps results open while focus moves into a portaled Select listbox', async () => {
    const mounted = await mount()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Open global search'))
    const input = element(mounted.root, (node) => node.tag === 'input')
    await inputValue(input, 'sample')

    await focusout(input, {
      closest: (selector: string) => selector.includes('[role="listbox"]') ? {} : null,
    })
    expect(findElement(mounted.root, (node) => node.props.id === 'quick-search-results')).toBeDefined()

    await focusout(input, { closest: () => null })
    expect(findElement(mounted.root, (node) => node.props.id === 'quick-search-results')).toBeUndefined()
    mounted.app.unmount()
  })

  it('shows object inventory mode only for authenticated search', async () => {
    authToken.value = null
    const mounted = await mount()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Open global search'))
    await inputValue(element(mounted.root, (node) => node.tag === 'input'), 'sample')
    expect(findElement(mounted.root, (node) => node.props['aria-label'] === 'Object inventory search mode')).toBeUndefined()

    authToken.value = 'token-a'
    await flush()
    expect(findElement(mounted.root, (node) => node.props['aria-label'] === 'Object inventory search mode')).toBeDefined()
    mounted.app.unmount()
  })

  it('marks a degraded answer with a warning icon and no status word', async () => {
    search.documents.value = [{
      document_id: 'doc-1',
      document_path: 'datasets/one',
      title: 'One',
      snippet: 'A dataset',
    }]
    search.searched.value = true
    search.complete.value = false
    const mounted = await mount()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Open global search'))
    await inputValue(element(mounted.root, (node) => node.tag === 'input'), 'sample')

    const dialog = element(mounted.root, (node) => node.props.role === 'dialog')
    expect(element(mounted.root, (node) => node.props['aria-label'] === 'Search coverage: partial')).toBeDefined()
    expect(content(dialog)).not.toContain('Partial')
    expect(content(dialog)).not.toContain('Complete')
    expect(content(dialog)).toContain('Retry')
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).trim() === 'Retry'))
    expect(search.retry).toHaveBeenCalledOnce()
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('flattens typed results with kind tags and puts coverage in the footer', async () => {
    search.documents.value = [{
      document_id: 'doc-1',
      document_path: 'datasets/one',
      title: 'One',
      snippet: 'A dataset',
    }]
    search.objects.value = [{
      kind: 'object',
      mode: 'distributed_best_effort',
      issuer_node_id: 'node-b',
      group_id: 'group-a',
      bucket: 'raw-data',
      key: 'reads/sample.fastq',
    }]
    search.objectCoverage.value = {
      scope: 'realm',
      mode: 'distributed_best_effort',
      index_freshness: { source: 'live_heads', as_of: '2026-08-19T09:00:00Z' },
      nodes_queried: 3,
      nodes_failed: 1,
      failed_partitions: ['node-c'],
      omitted_partitions: 0,
      complete: false,
      truncated: false,
      partitions: [],
    }
    search.objectSearched.value = true
    search.complete.value = false
    search.groups.value = [{ group_id: 'group-a', display_name: 'Group A' }]
    search.users.value = [{ user_id: 'user-a', name: 'Person A' }]
    const mounted = await mount()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Open global search'))
    await inputValue(element(mounted.root, (node) => node.tag === 'input'), 'sample')

    const icon = indexOf(mounted.root, (node) => node.props['aria-label'] === 'Search coverage: partial')
    const hit = indexOf(mounted.root, (node) => node.text.includes('reads/sample.fastq'))
    expect(icon).toBeGreaterThanOrEqual(0)
    expect(icon).toBeGreaterThan(hit)
    expect(allNodes(mounted.root).filter((node) => node.props.role === 'group')).toEqual([])
    const options = allNodes(mounted.root).filter((node) => node.props.role === 'option')
    expect(options.map((node) => node.props.id)).toEqual([
      'qs-d:doc-1',
      'qs-o:node-b:raw-data:reads/sample.fastq',
      'qs-g:group-a',
      'qs-u:user-a',
    ])
    expect(content(options[0])).toContain('Dataset')
    expect(content(options[1])).toContain('Object')
    expect(content(options[2])).toContain('Group')
    expect(content(options[3])).toContain('User')
    const text = content(element(mounted.root, (node) => node.props.role === 'dialog'))
    expect(text).not.toContain('Datasets')
    expect(text).not.toContain('Data objects')
    expect(text).not.toContain('Groups')
    expect(text).not.toContain('Users')
    expect(text).not.toContain('Partial object inventory')
    expect(text).toContain('Distributed best-effort · Node: Storage node B · Group: group-a · Bucket: raw-data')
    expect(text).not.toContain('Object · Distributed best-effort')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('shows the coverage icon alone and opens the full search page', async () => {
    search.objects.value = [{
      kind: 'object',
      mode: 'distributed_best_effort',
      issuer_node_id: 'node-b',
      group_id: 'group-a',
      bucket: 'raw-data',
      key: 'reads/sample.fastq',
    }]
    search.objectCoverage.value = {
      scope: 'realm',
      mode: 'distributed_best_effort',
      index_freshness: { source: 'live_heads', as_of: '2026-08-19T09:00:00Z' },
      nodes_queried: 3,
      nodes_failed: 0,
      failed_partitions: [],
      omitted_partitions: 0,
      complete: true,
      truncated: false,
      partitions: [],
    }
    search.objectSearched.value = true
    const mounted = await mount()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Open global search'))
    await inputValue(element(mounted.root, (node) => node.tag === 'input'), 'sample')

    const dialog = element(mounted.root, (node) => node.props.role === 'dialog')
    expect(content(dialog)).not.toContain('Complete')
    expect(content(dialog)).not.toContain('Nodes queried')
    expect(content(dialog)).not.toContain('Freshness source')

    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Search coverage: complete'))
    expect(routerPush).toHaveBeenCalledWith({ name: 'datasets', query: { q: 'sample' } })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('presents a strict object failure without fallback results', async () => {
    search.documents.value = [{
      document_id: 'doc-1',
      document_path: 'datasets/one',
      title: 'One',
    }]
    const mounted = await mount()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Open global search'))
    if (!configuredObjectMode) throw new Error('Object mode was not configured')
    configuredObjectMode.value = 'distributed_strict'
    search.objectSearched.value = true
    search.objectError.value = 'Strict coverage unavailable'
    search.complete.value = false
    await flush()

    const text = content(element(mounted.root, (node) => node.props.role === 'dialog'))
    expect(text).toContain('Distributed strict unavailable')
    expect(text).toContain('Strict mode did not fall back to best-effort')
    expect(text).not.toContain('reads/sample.fastq')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
