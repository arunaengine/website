import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'

const sessionEpoch = ref(0)
const getGitRepository = vi.fn()
const Empty = defineComponent(() => () => null)
const DocsLinkStub = defineComponent({
  props: { topic: String, label: String },
  setup: (props) => () => h('a', { 'data-topic': props.topic }, props.label),
})

const DatasetGitRow = compileClientComponent(new URL('./DatasetGitRow.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
  '@/components/ui/DocsLink.vue': moduleDefault(DocsLinkStub),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch }),
  },
  '@/lib/api': { ...Api, getGitRepository },
})

const CLONE = 'https://api.test/git/d1.git'

function repository(documentId = 'd1') {
  return { document_id: documentId, clone_url: `https://api.test/git/${documentId}.git`, lfs_url: '', bucket: 'b', refs: {} }
}

beforeEach(() => {
  sessionEpoch.value = 0
  getGitRepository.mockReset()
})

describe('DatasetGitRow', () => {
  it('shows the clone URL with the docs link', async () => {
    getGitRepository.mockResolvedValue(repository())
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()
    const text = content(mounted.root)

    expect(getGitRepository).toHaveBeenCalledWith('d1', { baseUrl: 'https://api.test', token: 'bearer' })
    expect(text).toContain('Git repository')
    expect(text).toContain(CLONE)
    expect(text).toContain('How to use Git with a dataset')
    mounted.app.unmount()
  })

  it.each([404, 403, 503])('stays hidden when the node answers %i', async (status) => {
    getGitRepository.mockRejectedValue(new Api.ApiError(status, 'no'))
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()

    expect(content(mounted.root)).toBe('')
    mounted.app.unmount()
  })

  it('drops an answer that arrives after the session changed', async () => {
    let answer!: (value: ReturnType<typeof repository>) => void
    getGitRepository
      .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
      .mockRejectedValueOnce(new Api.ApiError(403, 'no'))
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    sessionEpoch.value++
    await flush()
    answer(repository())
    await flush()

    expect(content(mounted.root)).toBe('')
    mounted.app.unmount()
  })
})
