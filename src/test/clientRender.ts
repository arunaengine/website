// One in-memory client renderer for the SFC tests. Vitest runs this repository
// in SSR mode with no DOM dependency, so a component under interaction is
// compiled here and mounted against plain objects that behave like nodes.
import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createRenderer, defineComponent, h, nextTick, type App, type Component } from 'vue'
import type { Router } from 'vue-router'
import * as Utils from '@/lib/utils'

/** Wraps a component so a test module map can hand it back as an import. */
export function moduleDefault(component: Component) {
  return { __esModule: true, default: component }
}

// Vitest runs this repository in SSR mode and there is no DOM test dependency.
// Compile only the three SFCs under test for the small in-memory client renderer.
export function compileClientComponent(url: URL, modules: Record<string, unknown>): Component {
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

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
let refreshControl: Component | null = null

/** The shared refresh control, compiled so a view test sees its real busy state. */
export function refreshButton(): Component {
  refreshControl ??= compileClientComponent(
    new URL('../components/ui/RefreshButton.vue', import.meta.url),
    {
      vue: VueRuntime,
      '@lucide/vue': new Proxy({}, { get: () => IconStub }),
      '@/components/ui/Button.vue': moduleDefault(ButtonStub),
      '@/lib/utils': Utils,
    },
  )
  return refreshControl
}

export type HostKind = 'root' | 'element' | 'text' | 'comment'

export interface HostNode {
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

export function hostNode(kind: HostKind, tag = '', text = ''): HostNode {
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

export const renderer = createRenderer<HostNode, HostNode>({
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

export function nodes(root: HostNode): HostNode[] {
  return [root, ...root.children.flatMap(nodes)]
}

// Comment placeholders (v-if, fragment anchors) are not content: a matcher
// must see the text a person would read.
export function content(node: HostNode): string {
  if (node.kind === 'comment') return ''
  return `${node.text}${node.children.map(content).join('')}`
}

export function element(root: HostNode, predicate: (node: HostNode) => boolean): HostNode {
  const match = nodes(root).find((node) => node.kind === 'element' && predicate(node))
  if (!match) throw new Error('Expected element was not rendered')
  return match
}

export function input(root: HostNode, key: string, value: unknown): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props[key] === value)
}

export function button(root: HostNode, label: string): HostNode {
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

export async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

export async function typeValue(node: HostNode, value: string) {
  node.value = value
  for (const listener of node.listeners.get('input') ?? []) listener({ target: node })
  if (typeof node.props.onInput === 'function') node.props.onInput({ target: node })
  await flush()
}

export async function click(node: HostNode) {
  const handler = node.props.onClick
  if (typeof handler === 'function') await handler({ target: node })
  else if (Array.isArray(handler)) await Promise.all(handler.map((entry) => entry({ target: node })))
  await flush()
}

// The host tree has no DOM, so a bubbling click is walked up by hand: a
// handler that stops propagation ends the walk, the way a row action must.
export async function bubbleClick(node: HostNode) {
  let stopped = false
  const event = {
    target: node,
    stopPropagation() {
      stopped = true
    },
  }
  for (let current: HostNode | null = node; current && !stopped; current = current.parent) {
    const handler = current.props.onClick
    if (typeof handler === 'function') await handler(event)
    else if (Array.isArray(handler)) for (const entry of handler) await entry(event)
  }
  await flush()
}

export interface Mounted {
  app: App<HostNode>
  root: HostNode
  errors: unknown[]
}

/** Mounts a compiled component; a router, when given, is already ready. */
export async function mountApp(
  component: Component,
  options: { router?: Router; props?: Record<string, unknown> } = {},
): Promise<Mounted> {
  const root = hostNode('root')
  const app = renderer.createApp(component, options.props)
  const errors: unknown[] = []
  app.config.errorHandler = (error) => errors.push(error)
  if (options.router) app.use(options.router)
  app.mount(root)
  await flush()
  return { app, root, errors }
}

