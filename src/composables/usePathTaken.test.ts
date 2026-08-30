import { effectScope, nextTick, ref, type EffectScope, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listMetadataPage = vi.fn()

vi.mock('@/composables/aruna/catalog', () => ({ listMetadataPage }))

const { usePathTaken } = await import('@/composables/usePathTaken')

function page(paths: string[]) {
  return {
    documents: paths.map((path) => ({ document_path: path })),
    limit: 5,
    offset: 0,
    total_returned: paths.length,
  }
}

let scope: EffectScope | undefined

function start(groupId: Ref<string | undefined>, path: Ref<string>, known: Ref<string[]>) {
  scope = effectScope()
  return scope.run(() => usePathTaken(groupId, path, known))!
}

beforeEach(() => {
  vi.useFakeTimers()
  listMetadataPage.mockReset().mockResolvedValue(page([]))
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.useRealTimers()
})

describe('dataset path conflicts', () => {
  it('answers from the loaded paths without asking', async () => {
    const { taken, checking } = start(ref('group-1'), ref('datasets/one'), ref(['datasets/one']))

    expect(taken.value).toBe(true)
    expect(checking.value).toBe(false)
    await vi.advanceTimersByTimeAsync(300)
    expect(listMetadataPage).not.toHaveBeenCalled()
  })

  it('asks the node after the pause', async () => {
    listMetadataPage.mockResolvedValue(page(['datasets/two']))
    const { taken, checking } = start(ref('group-1'), ref('datasets/two'), ref([]))

    expect(checking.value).toBe(true)
    await vi.advanceTimersByTimeAsync(299)
    expect(listMetadataPage).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(listMetadataPage).toHaveBeenCalledWith({
      group_id: 'group-1',
      path_prefix: 'datasets/two',
      limit: 5,
    })
    expect(taken.value).toBe(true)
    expect(checking.value).toBe(false)
  })

  it('ignores a document below the path', async () => {
    // The prefix filter also returns what sits under the path; only an exact
    // path is a conflict.
    listMetadataPage.mockResolvedValue(page(['datasets/two/deeper']))
    const { taken } = start(ref('group-1'), ref('datasets/two'), ref([]))

    await vi.advanceTimersByTimeAsync(300)

    expect(taken.value).toBe(false)
  })

  it('leaves the path free when the listing fails', async () => {
    listMetadataPage.mockRejectedValue(new Error('offline'))
    const { taken, checking } = start(ref('group-1'), ref('datasets/two'), ref([]))

    await vi.advanceTimersByTimeAsync(300)

    expect(taken.value).toBe(false)
    expect(checking.value).toBe(false)
  })

  it('drops the answer to a path that changed', async () => {
    let settle: (value: unknown) => void = () => {}
    listMetadataPage.mockReturnValueOnce(new Promise((resolve) => { settle = resolve }))
    const path = ref('datasets/two')
    const { taken } = start(ref('group-1'), path, ref([]))

    await vi.advanceTimersByTimeAsync(300)
    path.value = 'datasets/three'
    await nextTick()
    settle(page(['datasets/two']))
    await vi.advanceTimersByTimeAsync(0)

    expect(taken.value).toBe(false)
  })

  it('checks nothing without a group or a path', async () => {
    const groupId = ref<string | undefined>(undefined)
    const path = ref('datasets/two')
    const { taken, checking } = start(groupId, path, ref([]))

    expect(checking.value).toBe(false)
    path.value = ''
    groupId.value = 'group-1'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    expect(listMetadataPage).not.toHaveBeenCalled()
    expect(taken.value).toBe(false)
  })
})
