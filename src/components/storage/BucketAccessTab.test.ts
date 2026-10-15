import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as PublicAccessLib from '@/lib/publicAccess'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, flush, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const ROOT = '/realm-1/g/g-1/data/node-1'
const publicRole = ref<{ role_id: string; name: string; permissions: Record<string, string>; public: boolean } | null>(null)
const revokePublic = vi.fn().mockResolvedValue(undefined)

const tab = compileClientComponent(new URL('./BucketAccessTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/data/PublicAccessDialog.vue': moduleDefault(defineComponent(() => () => null)),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
  '@/composables/usePublicAccess': {
    usePublicAccess: () => ({
      role: publicRole,
      loading: ref(false),
      error: ref(null),
      canManage: ref(true),
      root: () => ROOT,
      revoke: revokePublic,
    }),
  },
  '@/lib/publicAccess': PublicAccessLib,
  '@/lib/utils': Utils,
})

async function mountTab() {
  const { root } = await mountApp(tab, { props: { bucket: 'reef-survey', groupId: 'g-1', nodeId: null } })
  await flush()
  return root
}

describe('bucket public access', () => {
  it('says nothing is public without a rule', async () => {
    publicRole.value = null
    const root = await mountTab()

    expect(content(root)).toContain('Public access')
    expect(content(root)).toContain('Nothing in this bucket is public.')
  })

  it('lists the bucket rules and removes one', async () => {
    publicRole.value = {
      role_id: 'r-public',
      name: 'public',
      permissions: {
        [`${ROOT}/reef-survey/raw/**`]: 'read',
        [`${ROOT}/reef-survey/notes.md`]: 'read',
        [`${ROOT}/other/**`]: 'read',
      },
      public: true,
    }
    try {
      const root = await mountTab()

      expect(content(root)).toContain('Everyone can read the file notes.md')
      expect(content(root)).toContain('Everyone can read the folder raw/')
      expect(content(root)).not.toContain('other')

      const removes = nodes(root).filter((node) => node.tag === 'button' && content(node).trim() === 'Remove')
      expect(removes).toHaveLength(2)
      await click(removes[1]!)

      expect(revokePublic).toHaveBeenCalledWith(null, [{ kind: 'folder', bucket: 'reef-survey', key: 'raw/' }])
      expect(button(root, 'Whole bucket')).toBeTruthy()
    } finally {
      publicRole.value = null
    }
  })
})
