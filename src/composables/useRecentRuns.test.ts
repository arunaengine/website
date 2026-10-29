import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listTasks: vi.fn(), tesEnabled: { value: true }, desktop: { on: false } }))
const sessionEpoch = ref(1)
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ sessionEpoch }) }))
vi.mock('@/composables/useTes', () => ({ useTes: () => ({ tesEnabled: mocks.tesEnabled, listTasks: mocks.listTasks }) }))
vi.mock('@/composables/useRealmNodes', () => ({
  useRealmNodes: () => ({ targets: ref([{ nodeId: 'home', isLocal: true, apiBase: '/api/v1' }, { nodeId: 'store-1', isLocal: false, apiBase: 'https://store-1/api/v1' }]) }),
}))
vi.mock('@/lib/desktop', () => ({ isDesktop: () => mocks.desktop.on }))
const { useRecentRuns } = await import('./useRecentRuns')

const task = (id: string, creation_time: string, state: string) => ({ id, name: id, creation_time, state })

beforeEach(() => {
  mocks.listTasks.mockReset()
  mocks.tesEnabled.value = true
  mocks.desktop.on = false
})

describe('recent runs', () => {
  it('merges the serving node and the other realm nodes, newest first, and counts the running ones', async () => {
    mocks.listTasks.mockImplementation(async (_params: unknown, base?: string) =>
      base
        ? { tasks: [task('remote', '2026-10-29T10:00:00Z', 'RUNNING')] }
        : { tasks: [task('old', '2026-10-28T10:00:00Z', 'COMPLETE'), task('new', '2026-10-29T12:00:00Z', 'QUEUED')] })
    const runs = useRecentRuns()
    await runs.load()

    expect(runs.runs.value.map((run) => [run.task.id, run.nodeId])).toEqual([['new', null], ['remote', 'store-1'], ['old', null]])
    expect(runs.running.value).toEqual({ count: 2, atLeast: false })
  })

  it('calls the count a lower bound when a node does not answer or has more pages', async () => {
    mocks.listTasks.mockImplementation(async (_params: unknown, base?: string) => {
      if (base) throw new Error('unreachable')
      return { tasks: [task('a', '2026-10-29T12:00:00Z', 'RUNNING')], next_page_token: 'p2' }
    })
    const runs = useRecentRuns()
    await runs.load()
    expect(runs.running.value).toEqual({ count: 1, atLeast: true })
  })

  it('reads nothing where the portal serves no compute', async () => {
    mocks.tesEnabled.value = false
    const runs = useRecentRuns()
    await runs.load()
    expect(runs.state.value).toBe('off')
    expect(mocks.listTasks).not.toHaveBeenCalled()
  })

  it('drops the runs of the last account at once on a session change, and its late answer', async () => {
    mocks.listTasks.mockImplementation(async () => ({ tasks: [task('theirs', '2026-10-29T10:00:00Z', 'RUNNING')] }))
    const runs = useRecentRuns()
    await runs.load()
    expect(runs.state.value).toBe('ready')

    const answers: ((page: unknown) => void)[] = []
    mocks.listTasks.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
    const late = runs.load()
    sessionEpoch.value++
    expect(runs.runs.value).toEqual([])
    expect(runs.running.value).toEqual({ count: 0, atLeast: false })
    expect(runs.state.value).toBe('idle')

    for (const answer of answers) answer({ tasks: [task('theirs-late', '2026-10-29T11:00:00Z', 'RUNNING')] })
    await late
    expect(runs.runs.value).toEqual([])
  })
})
