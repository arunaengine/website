import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportRoot } from '@/lib/api'

const aruna = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { sessionEpoch: ref(1), apiBaseUrl: ref('https://api'), authToken: ref('t') }
})
const getImportRoots = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), getImportRoots }))

const { useImportRoots } = await import('@/composables/useImportRoots')

const projects: ImportRoot = { name: 'projects', writable: false }
const scratch: ImportRoot = { name: 'scratch', writable: true }

function start(group = 'g1', active = true) {
  const groupId = ref(group)
  const open = ref(active)
  const scope = effectScope()
  return { groupId, open, roots: scope.run(() => useImportRoots(groupId, open))!, scope }
}

function later<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('import roots', () => {
  beforeEach(() => {
    getImportRoots.mockReset()
    aruna.sessionEpoch.value = 1
  })

  it('lists the approved folders of the group', async () => {
    getImportRoots.mockResolvedValue({ roots: [projects, scratch] })
    const { roots, scope } = start()
    expect(roots.state.value).toBe('loading')
    await vi.waitFor(() => expect(roots.state.value).toBe('ready'))
    expect(getImportRoots).toHaveBeenCalledWith('g1', { baseUrl: 'https://api', token: 't' })
    expect(roots.roots.value).toEqual([projects, scratch])
    scope.stop()
  })

  it('reports a failed read instead of an empty list, and reads again on request', async () => {
    getImportRoots.mockRejectedValueOnce(new Error('node down')).mockResolvedValueOnce({ roots: [] })
    const { roots, scope } = start()
    await vi.waitFor(() => expect(roots.state.value).toBe('failed'))
    expect(roots.error.value).toBe('node down')
    await roots.load()
    expect(roots.state.value).toBe('ready')
    expect(roots.roots.value).toEqual([])
    scope.stop()
  })

  it('drops the answer for a group that is no longer shown', async () => {
    const first = later<{ roots: ImportRoot[] }>()
    getImportRoots.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ roots: [scratch] })
    const { groupId, roots, scope } = start()
    groupId.value = 'g2'
    await vi.waitFor(() => expect(roots.roots.value).toEqual([scratch]))
    first.resolve({ roots: [projects] })
    await nextTick()
    expect(roots.roots.value).toEqual([scratch])
    expect(roots.state.value).toBe('ready')
    scope.stop()
  })

  it('drops a late failure after the session changed', async () => {
    const first = later<{ roots: ImportRoot[] }>()
    getImportRoots.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ roots: [scratch] })
    const { roots, scope } = start()
    aruna.sessionEpoch.value = 2
    await vi.waitFor(() => expect(roots.state.value).toBe('ready'))
    first.reject(new Error('old session'))
    await nextTick()
    expect(roots.state.value).toBe('ready')
    expect(roots.error.value).toBeNull()
    scope.stop()
  })

  it('reads nothing while inactive and forgets the list when it closes', async () => {
    getImportRoots.mockResolvedValue({ roots: [projects] })
    const { open, roots, scope } = start('g1', false)
    expect(getImportRoots).not.toHaveBeenCalled()
    open.value = true
    await vi.waitFor(() => expect(roots.state.value).toBe('ready'))
    open.value = false
    await nextTick()
    expect(roots.state.value).toBe('idle')
    expect(roots.roots.value).toEqual([])
    scope.stop()
  })
})
