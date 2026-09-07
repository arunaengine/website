import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'

const context = ref<{ groupId: string } | null>(null)
const replace = vi.fn()
const location = ref<{ bucket: string; prefix: string; key?: string } | null>(null)
const route = { query: { browse: '1' } as Record<string, string> }
const DataView = defineComponent(() => () => h('main', 'data view'))

const view = compileClientComponent(new URL('./NotebooksView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ replace }), useRoute: () => route },
  '@/views/DataManagerView.vue': moduleDefault(DataView),
  '@/composables/useS3': { useS3: () => ({ activeContext: context }) },
  '@/composables/useGroupSelection': { activeGroupId: ref('group-1') },
  '@/composables/useNotebookLocation': {
    useNotebookLocation: () => ({ scope: ref('scope'), location, remember: vi.fn() }),
  },
})

beforeEach(() => {
  context.value = { groupId: 'group-1' }
  replace.mockReset()
  location.value = null
  route.query.browse = '1'
})

describe('notebooks entry', () => {
  it('resumes the remembered notebook from the sidebar entry', async () => {
    route.query.browse = ''
    location.value = { bucket: 'reef', prefix: 'notebooks', key: 'notebooks/analysis.ipynb' }
    const { app } = await mountApp(view)
    expect(replace).toHaveBeenCalledWith({
      name: 'notebook',
      params: { bucketId: 'reef', key: 'notebooks/analysis.ipynb' },
      query: { group: 'group-1' },
    })
    app.unmount()
  })

  it('shows the data view when browsing was requested', async () => {
    location.value = { bucket: 'reef', prefix: 'notebooks', key: 'notebooks/analysis.ipynb' }
    const { root, app } = await mountApp(view)
    expect(replace).not.toHaveBeenCalled()
    expect(content(root)).toContain('data view')
    app.unmount()
  })

  it('waits for the storage session of the remembered group', async () => {
    route.query.browse = ''
    context.value = { groupId: 'other-group' }
    location.value = { bucket: 'reef', prefix: 'notebooks', key: 'notebooks/analysis.ipynb' }
    const { app } = await mountApp(view)
    expect(replace).not.toHaveBeenCalled()
    app.unmount()
  })
})
