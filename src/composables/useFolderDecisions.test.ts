import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { readAction, readFolder } from '@/lib/deviceApi'

const folders = ref([
  readFolder({ folder_id: 'f1', root: '/home/me/Lab/Runs' }),
  readFolder({ folder_id: 'f2', root: '/home/me/Lab/Reports' }),
])
const actionLog = vi.fn()

vi.mock('@/composables/useSyncedFolders', () => ({ useSyncedFolders: () => ({ folders, actionLog }) }))

const record = (action: string, path: string, at_ms: number) => readAction({ action, path, at_ms })

async function decisions() {
  const { useFolderDecisions } = await import('./useFolderDecisions')
  return useFolderDecisions()
}

beforeEach(() => {
  actionLog.mockReset()
})

describe('folder decisions', () => {
  it('merges every folder log, newest first, and drops what it cannot word', async () => {
    actionLog.mockImplementation(async (id: string) =>
      id === 'f1'
        ? [record('keep_local', 'a.csv', 10), record('mystery', 'x', 99)]
        : [record('replace_local', 'b.csv', 20)],
    )
    const found = await decisions()

    await found.load()

    expect(found.state.value).toBe('ready')
    expect(found.partial.value).toBe(false)
    expect(found.items.value.map((item) => [item.folder, item.text])).toEqual([
      ['Reports', 'Used the Aruna version of b.csv'],
      ['Runs', 'Kept your version of a.csv'],
    ])
    expect(found.latest.value?.folder).toBe('Reports')
  })

  it('says so when only some folders answered', async () => {
    actionLog.mockImplementation(async (id: string) => {
      if (id === 'f2') throw new Error('gone')
      return [record('keep_local', 'a.csv', 10)]
    })
    const found = await decisions()

    await found.load()

    expect(found.state.value).toBe('ready')
    expect(found.partial.value).toBe(true)
    expect(found.items.value).toHaveLength(1)
  })

  it('reports an unserved route instead of an empty history', async () => {
    actionLog.mockRejectedValue(new ApiError(404, 'nope'))
    const found = await decisions()

    await found.load()

    expect(found.state.value).toBe('unsupported')
    expect(found.items.value).toEqual([])
  })
})
