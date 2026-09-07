import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiBaseUrl = ref('/api/v1')
const currentUser = ref({ id: 'one' })
const nodeInfo = ref({ node: { realm_id: 'realm', peer_id: 'node' } })
const activeGroupId = ref('group')
const stored = new Map<string, string>()
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ apiBaseUrl, currentUser, nodeInfo }) }))
vi.mock('@/composables/useGroupSelection', () => ({ activeGroupId }))
vi.mock('@/composables/aruna/state', () => ({
  readStored: (key: string) => stored.get(key) ?? '',
  storeValue: (key: string, value: string) => stored.set(key, value),
}))
const { useNotebookLocation } = await import('./useNotebookLocation')

beforeEach(() => {
  stored.clear()
  apiBaseUrl.value = '/api/v1'
  currentUser.value = { id: 'one' }
  nodeInfo.value = { node: { realm_id: 'realm', peer_id: 'node' } }
  activeGroupId.value = 'group'
})

describe('remembered notebook location', () => {
  it('restores the selected notebook and browse folder on a later visit', () => {
    const first = effectScope()
    const location = first.run(useNotebookLocation)!
    location.remember({ bucket: 'lab', prefix: 'notebooks', key: 'notebooks/analysis.ipynb' })
    location.remember({ bucket: 'lab', prefix: 'other-folder' })
    first.stop()
    const second = effectScope()
    expect(second.run(useNotebookLocation)!.location.value).toEqual({ bucket: 'lab', prefix: 'other-folder', key: 'notebooks/analysis.ipynb' })
    second.stop()
  })

  it.each(['user', 'group', 'node', 'realm', 'api'])('does not reuse another %s selection', async (change) => {
    const scope = effectScope()
    const location = scope.run(useNotebookLocation)!
    location.remember({ bucket: 'private', prefix: '', key: 'private.ipynb' })
    if (change === 'user') currentUser.value = { id: 'two' }
    if (change === 'group') activeGroupId.value = 'another'
    if (change === 'node') nodeInfo.value.node.peer_id = 'another'
    if (change === 'realm') nodeInfo.value.node.realm_id = 'another'
    if (change === 'api') apiBaseUrl.value = 'https://other.example/api/v1'
    await nextTick()
    expect(location.location.value).toBeNull()
    scope.stop()
  })

  it('drops the old notebook when browsing a different bucket', () => {
    const scope = effectScope()
    const location = scope.run(useNotebookLocation)!
    location.remember({ bucket: 'first', prefix: '', key: 'analysis.ipynb' })
    location.remember({ bucket: 'second', prefix: '' })
    expect(location.location.value).toEqual({ bucket: 'second', prefix: '' })
    scope.stop()
  })
})
