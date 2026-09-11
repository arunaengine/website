import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'

const replace = vi.fn()
const location = ref<{ bucket: string; prefix: string; key?: string } | null>(null)
const route = { query: { browse: '1' } as Record<string, string> }
const DataView = defineComponent(() => () => h('main', 'data view'))

const view = compileClientComponent(new URL('./NotebooksView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ replace }), useRoute: () => route },
  '@/views/DataManagerView.vue': moduleDefault(DataView),
  '@/composables/useGroupSelection': { activeGroupId: ref('group-1') },
  '@/composables/useNotebookLocation': {
    useNotebookLocation: () => ({ scope: ref('scope'), location, remember: vi.fn() }),
  },
})

beforeEach(() => {
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

  // Returning from another page leaves no storage session for this group.
  it('reopens the last notebook without a storage session', async () => {
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

  it('keeps the picker when the saved location has no notebook', async () => {
    route.query.browse = ''
    location.value = { bucket: 'reef', prefix: 'notebooks' }
    const { root, app } = await mountApp(view)
    expect(replace).not.toHaveBeenCalled()
    expect(content(root)).toContain('data view')
    app.unmount()
  })
})
