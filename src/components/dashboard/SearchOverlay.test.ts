import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createRenderer, defineComponent, h, nextTick, ref, type App, type Component } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const SpinnerStub = defineComponent((_, { attrs }) => () => h('span', attrs, 'Searching…'))
const IconStub = defineComponent(() => () => h('svg'))
const icons = new Proxy({}, { get: () => IconStub })
const moduleDefault = (component: Component) => ({ __esModule: true, default: component })

const narrow = ref(true)
const mediaQuery = vi.fn(() => narrow)
const routerPush = vi.fn()
const search = {
  documents: ref<Array<Record<string, unknown>>>([]),
  groups: ref<Array<Record<string, unknown>>>([]),
  users: ref<Array<Record<string, unknown>>>([]),
  pending: ref(false),
  searched: ref(false),
  error: ref<string | null>(null),
  nodesQueried: ref(0),
  nodesFailed: ref(0),
  truncated: ref(false),
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

const compiled = compileClientComponent(new URL('./SearchOverlay.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push: routerPush }) },
  '@vueuse/core': { useMediaQuery: mediaQuery },
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/composables/useRealm': { useRealm: () => ({ realm: ref({ shortName: 'Test realm' }) }) },
  '@/composables/useUnifiedSearch': { useUnifiedSearch: () => search },
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
  search.pending.value = false
  search.searched.value = false
  search.error.value = null
  search.nodesQueried.value = 0
  search.nodesFailed.value = 0
  search.truncated.value = false
  search.retry.mockReset()
}

beforeEach(() => {
  teleportBody.children = []
  activeElement = null
  narrow.value = true
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

  it('renders truncation as Partial with the shared completeness vocabulary inside the panel', async () => {
    search.documents.value = [{
      document_id: 'doc-1',
      document_path: 'datasets/one',
      title: 'One',
      snippet: 'A dataset',
    }]
    search.searched.value = true
    search.nodesQueried.value = 2
    search.truncated.value = true
    const mounted = await mount()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Open global search'))

    const dialog = element(mounted.root, (node) => node.props.role === 'dialog')
    expect(content(dialog)).toContain('Partial')
    expect(content(dialog)).toContain('document results were truncated')
    expect(content(dialog)).toContain('Retry')
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).trim() === 'Retry'))
    expect(search.retry).toHaveBeenCalledOnce()
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
