import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { baseParse, NodeTypes } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import * as RouteTab from '@/composables/useRouteTab'
import * as Utils from '@/lib/utils'

interface AstNode {
  type: number
  tag?: string
  props?: Array<{
    type: number
    name?: string
    value?: { content: string }
  }>
  children?: AstNode[]
  loc: { source: string }
}

const source = readFileSync(fileURLToPath(new URL('./SettingsView.vue', import.meta.url)), 'utf8')
const parsed = parse(source, { filename: 'SettingsView.vue' })
if (parsed.errors.length) throw parsed.errors[0]
if (!parsed.descriptor.template) throw new Error('SettingsView.vue has no template')
const root = baseParse(parsed.descriptor.template.content) as unknown as AstNode

function staticAttribute(node: AstNode, name: string): string | undefined {
  return node.props?.find((prop) => prop.type === NodeTypes.ATTRIBUTE && prop.name === name)?.value?.content
}

function classTokens(node: AstNode): string[] {
  return staticAttribute(node, 'class')?.split(/\s+/) ?? []
}

function findElementPath(
  node: AstNode,
  predicate: (candidate: AstNode) => boolean,
  ancestors: AstNode[] = [],
): AstNode[] | undefined {
  const path = node.type === NodeTypes.ELEMENT ? [...ancestors, node] : ancestors
  if (node.type === NodeTypes.ELEMENT && predicate(node)) return path
  for (const child of node.children ?? []) {
    const match = findElementPath(child, predicate, path)
    if (match) return match
  }
  return undefined
}

function collectElements(node: AstNode, predicate: (candidate: AstNode) => boolean): AstNode[] {
  const matches: AstNode[] = []
  if (node.type === NodeTypes.ELEMENT && predicate(node)) matches.push(node)
  for (const child of node.children ?? []) matches.push(...collectElements(child, predicate))
  return matches
}

describe('SettingsView responsive geometry', () => {
  it('holds auth-dependent panels behind the bootstrap first-paint gate', () => {
    expect(source).toContain("import SectionSkeleton from '@/components/ui/SectionSkeleton.vue'")
    expect(source).toContain("import { useFirstPaint } from '@/composables/useFirstPaint'")
    expect(source).toContain(
      '() => bootstrapped.value && !loading.value && !authPending.value,',
    )

    const skeleton = source.indexOf('<div v-if="!painted"')
    const firstPanel = source.indexOf('<TabsContent')
    expect(skeleton).toBeGreaterThan(-1)
    expect(firstPanel).toBeGreaterThan(skeleton)
    expect(source).toContain('<template v-else>')
  })

  it('does not contain the removed placeholder control or identifiers', () => {
    const removedLabel = ['Hide sensitive', 'hashes by default'].join(' ')
    const removedCopy = ['Hash display controls', 'are local UI-only preferences.'].join(' ')
    const removedIdentifierParts = [
      ['hide', 'sensitive', 'hash'],
      ['hash', 'preference'],
      ['preferences', 'hash'],
    ]

    expect(source).not.toContain(removedLabel)
    expect(source).not.toContain(removedCopy)
    for (const parts of removedIdentifierParts) expect(source).not.toMatch(new RegExp(parts.join('[._-]?'), 'i'))
    expect(source).not.toContain("@/components/ui/Switch.vue")
    expect(collectElements(root, (node) => node.tag === 'Switch')).toHaveLength(0)
  })

  it('offers every settings section as a shareable tab', () => {
    const tabIds = ['profile', 'groups', 'access', 'assistant', 'appearance']
    const tabList = source.match(/const settingsTabs = \[([\s\S]*?)\] as const/)?.[1] ?? ''
    const declaredIds = Array.from(tabList.matchAll(/\{ id: '([^']+)'/g), (match) => match[1])
    const panelIds = collectElements(root, (node) => node.tag === 'TabsContent')
      .map((node) => staticAttribute(node, 'value'))
      .filter((id): id is string => Boolean(id))

    expect(declaredIds).toEqual(tabIds)
    expect(panelIds.sort()).toEqual([...tabIds].sort())
    // Tabs live in ?tab= so a section is a link a person can share or reload into.
    expect(source).toContain('const routeTab = useRouteTab(')
    expect(source).toContain("legacyTabs: Record<string, string> = { sessions: 'access', connection: 'access' }")
    expect(source).not.toContain('settingsSections')
    expect(source).not.toContain('onMobileTabsKeydown')
  })

  it('keeps the tab row scrollable and drops the anchored submenu', () => {
    const listPath = findElementPath(
      root,
      (node) => node.tag === 'TabsList' && staticAttribute(node, 'aria-label') === 'Settings sections',
    )
    expect(listPath).toBeDefined()
    expect(listPath?.some((node) => classTokens(node).includes('overflow-x-auto'))).toBe(true)
    expect(collectElements(root, (node) => node.tag === 'TabsTrigger')).toHaveLength(1)
    expect(source).not.toContain('@4xl:grid-cols-[260px_1fr]')
    expect(source).not.toContain('lg:grid-cols-[260px_1fr]')
    expect(source).not.toContain('scroll-mt-20')
  })

  it('keeps the assistant tab holding the provider list', () => {
    // The chat's cogwheel links here with ?tab=assistant.
    const panel = collectElements(root, (node) => node.tag === 'TabsContent')
      .find((node) => staticAttribute(node, 'value') === 'assistant')

    expect(panel).toBeDefined()
    expect(collectElements(panel!, (node) => node.tag === 'AssistantProviders')).toHaveLength(1)
    expect(collectElements(panel!, (node) => node.tag === 'McpConnect')).toHaveLength(1)
  })

  it('keeps the watched resources page reachable from the settings header', () => {
    expect(source).toContain("{ name: 'settings-watches' }")
    expect(source).toContain('Watched resources')
  })

  it('places the credentials table inside a horizontal overflow boundary', () => {
    const tablePath = findElementPath(root, (node) => node.tag === 'table')
    expect(tablePath).toBeDefined()
    const tableParent = tablePath?.at(-2)
    const credentialsSection = tablePath?.find((node) => node.tag === 'section')

    expect(tableParent?.tag).toBe('div')
    expect(classTokens(tableParent!)).toEqual(expect.arrayContaining(['min-w-0', 'overflow-x-auto']))
    expect(classTokens(credentialsSection!)).toContain('overflow-hidden')
  })
})

const isAuthenticated = ref(true)
const authPending = ref(false)
const currentUser = ref<Record<string, unknown> | null>({ id: 'user-1', name: 'Ada' })
const userInfo = ref<Record<string, unknown> | null>({ user: { user_id: 'user-1' } })
const authToken = ref('token')
const apiBaseUrl = ref('/api/v1')
const myGroups = ref<Array<Record<string, unknown>>>([])
const discoverableGroups = ref<Array<Record<string, unknown>>>([])

const aruna = {
  apiBaseUrl,
  authToken,
  currentUser,
  nodeInfo: ref(null),
  userInfo,
  myGroups,
  discoverableGroups,
  profiles: ref([]),
  credentials: ref([]),
  authError: ref<string | null>(null),
  bootstrapped: ref(true),
  loading: ref(false),
  sessionEpoch: ref(1),
  saving: ref(false),
  refresh: vi.fn(async () => undefined),
  setAuthToken: vi.fn(),
  setApiBaseUrl: vi.fn(),
  updateUserProfile: vi.fn(async () => undefined),
  revokeS3Credential: vi.fn(async () => undefined),
}
const auth = {
  signIn: vi.fn(async () => undefined),
  isAuthenticated,
  authPending,
  stage: ref('idle'),
  stageError: ref<string | null>(null),
}

const Empty = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => Empty })
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  setup: (props, { attrs }) => () => h('input', { ...attrs, value: props.modelValue }),
})
const PageHeaderStub = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), slots.actions?.()]),
})
const TabsStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  setup: (props, { attrs, slots }) => () => h('div', { ...attrs, 'data-active': props.modelValue }, slots.default?.()),
})
const PanelStub = defineComponent({
  props: { value: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('section', { 'data-panel': props.value }, slots.default?.()),
})
const TriggerStub = defineComponent({
  props: { value: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('button', { 'data-tab': props.value }, slots.default?.()),
})
const labelled = (label: string) => defineComponent(() => () => h('div', label))
const RouteStub = defineComponent(() => () => h('div'))

const SettingsView = compileClientComponent(new URL('./SettingsView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/lib/api': { apiOrigin: () => 'https://node.example' },
  '@/lib/utils': Utils,
  '@/composables/useRouteTab': RouteTab,
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useAuth': { useAuth: () => auth },
  '@/composables/useTheme': { useTheme: () => ({ mode: ref('system'), setTheme: vi.fn() }) },
  '@/composables/useRefresh': { useRefresh: () => ({ busy: ref(false), refresh: vi.fn() }) },
  '@/composables/useFirstPaint': { useFirstPaint: () => ref(true) },
  '@/composables/useWatches': { useWatches: () => ({ available: ref(false) }) },
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(Empty),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Avatar.vue': moduleDefault(Empty),
  '@/components/ui/AccessBadge.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/ui/Separator.vue': moduleDefault(Empty),
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
  '@/components/ui/SectionSkeleton.vue': moduleDefault(Empty),
  '@/components/ui/EmptyState.vue': moduleDefault(Passthrough),
  '@/components/ui/Tabs.vue': moduleDefault(TabsStub),
  '@/components/ui/TabsList.vue': moduleDefault(Passthrough),
  '@/components/ui/TabsTrigger.vue': moduleDefault(TriggerStub),
  '@/components/ui/TabsContent.vue': moduleDefault(PanelStub),
  '@/components/groups/CreateGroupDialog.vue': moduleDefault(Empty),
  '@/components/data/CreateCredentialDialog.vue': moduleDefault(Empty),
  '@/components/onboarding/DevicesPanel.vue': moduleDefault(labelled('Devices panel')),
  '@/components/settings/SessionsPanel.vue': moduleDefault(labelled('Sessions panel')),
  '@/components/settings/S3SessionsPanel.vue': moduleDefault(Empty),
  '@/components/settings/AssistantProviders.vue': moduleDefault(Empty),
  '@/components/settings/McpConnect.vue': moduleDefault(Empty),
})

async function mount(query: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/settings', name: 'settings', component: RouteStub },
      { path: '/app/settings/watches', name: 'settings-watches', component: RouteStub },
      { path: '/app/profiles', name: 'profiles', component: RouteStub },
      { path: '/app/groups/:id', name: 'group', component: RouteStub },
    ],
  })
  await router.push(`/app/settings${query}`)
  await router.isReady()
  return { ...(await mountApp(SettingsView, { router })), router }
}

function tabsRoot(node: HostNode): HostNode {
  return element(node, (candidate) => candidate.props['data-active'] !== undefined)
}

function panelText(node: HostNode, value: string): string {
  return content(element(node, (candidate) => candidate.props['data-panel'] === value))
}

// The tab setter replaces the route, so wait for the navigation, not a delay.
async function selectTab(router: Router, root: HostNode, value: string) {
  const settled = new Promise<void>((resolve) => {
    const stop = router.afterEach(() => {
      stop()
      resolve()
    })
  })
  ;(tabsRoot(root).props['onUpdate:modelValue'] as (next: string) => void)(value)
  await settled
  await flush()
}

describe('SettingsView access tab', () => {
  beforeEach(() => {
    isAuthenticated.value = true
    authPending.value = false
    currentUser.value = { id: 'user-1', name: 'Ada' }
    userInfo.value = { user: { user_id: 'user-1' } }
  })

  it('stacks connection, sessions, keys, devices and interop', async () => {
    const { root, errors } = await mount('?tab=access')

    const text = panelText(root, 'access')
    const markers = ['API connection', 'Sessions panel', 'S3 access keys', 'Devices panel', 'Interoperability']
    const positions = markers.map((marker) => text.indexOf(marker))
    expect(errors).toEqual([])
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((first, second) => first - second))
  })

  it('resolves legacy tab links to the merged panel', async () => {
    for (const query of ['?tab=sessions', '?tab=connection', '?tab=access']) {
      const { root } = await mount(query)
      expect(tabsRoot(root).props['data-active']).toBe('access')
    }
    expect(tabsRoot((await mount('?tab=profile')).root).props['data-active']).toBe('profile')
    expect(tabsRoot((await mount('?tab=nowhere')).root).props['data-active']).toBe('profile')
  })

  it('writes only current ids back to the query', async () => {
    const { root, router } = await mount('?tab=sessions')

    await selectTab(router, root, 'appearance')
    expect(router.currentRoute.value.query.tab).toBe('appearance')

    await selectTab(router, root, 'profile')
    expect(router.currentRoute.value.query.tab).toBeUndefined()
  })

  it('drops the signed-in row the sessions panel repeats', async () => {
    const { root } = await mount('?tab=access')

    const text = panelText(root, 'access')
    expect(text).not.toContain('Signed in as')
    expect(text).not.toContain('Sign out')
    expect(text).toContain('Identity details')
  })

  it('keeps the signed-out entry point', async () => {
    isAuthenticated.value = false
    currentUser.value = null
    userInfo.value = null

    const text = panelText((await mount('?tab=access')).root, 'access')
    expect(text).toContain('Not signed in')
    expect(text).toContain('Sign in')
    expect(text).toContain('Onboarding secret')
    expect(text).toContain('Existing API token')
  })
})

describe('SettingsView groups tab', () => {
  beforeEach(() => {
    myGroups.value = [{ id: 'g1', name: 'Genomics lab', tags: ['admin'], memberCount: 3 }]
    discoverableGroups.value = [{ id: 'g2', name: 'Climate lab', tags: [] }]
  })

  it('links every row to the group page instead of embedding it', async () => {
    // The embedded detail bound its own tabs to ?tab=, which the settings tabs
    // already own; one surface for group management removes the collision.
    const { root, errors } = await mount('?tab=groups')

    const links = nodes(root)
      .filter((node) => node.tag === 'a')
      .map((node) => String(node.props.href ?? ''))

    expect(errors).toEqual([])
    expect(links).toContain('/app/groups/g1')
    expect(links).toContain('/app/groups/g2')
    expect(source).not.toContain('GroupDetail')
    expect(panelText(root, 'groups')).toContain('Create group')
  })
})
