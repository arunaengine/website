import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Utils from '@/lib/utils'
import type { GetUserResponse, ResolveUserResult } from '@/lib/api'

const Empty = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const users = new Map<string, GetUserResponse>()
const directory = new Map<string, ResolveUserResult>()
const resolveUsers = vi.fn(async () => [])
const resolved = vi.fn(async (id: string) => users.get(id) ?? null)

const UserProfileView = compileClientComponent(new URL('./UserProfileView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/dashboard/PageHeader.vue': moduleDefault(Empty),
  '@/components/ui/Avatar.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
  '@/components/ui/Button.vue': moduleDefault(Passthrough),
  '@/components/ui/EmptyState.vue': moduleDefault(Passthrough),
  '@/components/ui/IconTile.vue': moduleDefault(Empty),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/SectionHeading.vue': moduleDefault(Empty),
  '@/components/assistant/AskAiButton.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    useAruna: () => ({ currentUser: ref({ id: 'me@R' }), sessionEpoch: ref(1), apiGroups: ref([]), canInspectUsers: ref(false) }),
    colorFor: () => '',
    initials: () => '',
  },
  '@/composables/useUserDirectory': {
    useUserDirectory: () => ({
      resolveUser: resolved,
      resolveUsers,
      cachedUser: (id: string) => directory.get(id) ?? null,
    }),
  },
  '@/lib/utils': Utils,
})

beforeEach(() => vi.clearAllMocks())

async function open(id: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/users/:id', name: 'user', component: Empty }],
  })
  await router.push(`/users/${id}`)
  await router.isReady()
  return mountApp(UserProfileView, { router })
}

describe('user profile', () => {
  it('names the account a merged account belongs to now', async () => {
    users.set('b1@R', { user_id: 'b1@R', name: 'Bob', subject_ids: [], attributes: { 'aruna-engine.org/merged-into': 'a1@R' } })
    directory.set('a1@R', { user_id: 'a1@R', name: 'Alice', attributes: {} })
    const { root, app } = await open('b1@R')
    await vi.waitFor(() => expect(content(root)).toContain('This account was merged into'))
    expect(resolveUsers).toHaveBeenCalledWith(['a1@R'])
    const link = element(root, (node) => node.tag === 'a' && content(node) === 'Alice')
    expect(link.props.href).toBe('/users/a1@R')
    app.unmount()
  })

  it('shows no note for an account of its own', async () => {
    users.set('c1@R', { user_id: 'c1@R', name: 'Carol', subject_ids: [], attributes: {} })
    const { root, app } = await open('c1@R')
    await vi.waitFor(() => expect(resolved).toHaveBeenCalledWith('c1@R', { force: false }))
    await flush()
    expect(content(root)).not.toContain('merged')
    expect(resolveUsers).not.toHaveBeenCalled()
    app.unmount()
  })
})
