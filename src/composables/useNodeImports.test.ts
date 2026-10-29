import { describe, expect, it, vi } from 'vitest'

const aruna = vi.hoisted(() => ({ listStagingJobs: vi.fn(), sessionEpoch: { value: 1 } }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
const { useNodeImports } = await import('./useNodeImports')

const jobs = (...states: string[]) => states.map((state, index) => ({ job_id: `j${index}`, state }))

describe('useNodeImports', () => {
  it('counts the running jobs of each node, asking a remote node by its id', async () => {
    aruna.listStagingJobs.mockReset().mockImplementation(async (_cursor: string | undefined, _limit: number, nodeId: string | null) =>
      ({ jobs: nodeId ? jobs('running', 'done', 'running') : jobs('queued', 'running') }))
    const { imports, total, load } = useNodeImports()
    await load(['home', 'node-2'], (id) => id === 'home')

    expect(aruna.listStagingJobs).toHaveBeenCalledWith(undefined, 200, null)
    expect(aruna.listStagingJobs).toHaveBeenCalledWith(undefined, 200, 'node-2')
    expect(imports.value.get('home')).toEqual({ running: 1, more: false })
    expect(imports.value.get('node-2')).toEqual({ running: 2, more: false })
    expect(total.value).toEqual({ running: 3, atLeast: false })
  })

  it('reads a few pages at most and calls the rest a lower bound', async () => {
    aruna.listStagingJobs.mockReset().mockImplementation(async (cursor?: string) => ({ jobs: jobs('running'), next_cursor: `${cursor ?? ''}x` }))
    const { imports, total, load } = useNodeImports()
    await load(['node-2'], () => false)

    expect(aruna.listStagingJobs).toHaveBeenCalledTimes(3)
    expect(imports.value.get('node-2')).toEqual({ running: 3, more: true })
    expect(total.value.atLeast).toBe(true)
  })

  it('gives a node that does not answer no count and keeps the total a lower bound', async () => {
    aruna.listStagingJobs.mockReset().mockImplementation(async (_cursor: unknown, _limit: unknown, nodeId: string | null) => {
      if (nodeId === 'node-3') throw new Error('unreachable')
      return { jobs: jobs('running') }
    })
    const { imports, total, load } = useNodeImports()
    await load(['node-2', 'node-3'], () => false)

    expect(imports.value.has('node-3')).toBe(false)
    expect(total.value).toEqual({ running: 1, atLeast: true })
  })

  it('drops an answer from an earlier session', async () => {
    let answer: (value: unknown) => void = () => {}
    aruna.listStagingJobs.mockReset().mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const { imports, load } = useNodeImports()
    const pending = load(['node-2'], () => false)
    aruna.sessionEpoch.value++
    answer({ jobs: jobs('running') })
    await pending

    expect(imports.value.size).toBe(0)
  })
})
