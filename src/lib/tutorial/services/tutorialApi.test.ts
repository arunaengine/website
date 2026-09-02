import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@/lib/api'
import type { JobStatusResponse } from '@/lib/jobs'
import type { TesTask } from '@/lib/tes'
import { RUN_STAGE_MS, TUTORIAL_TASK_ID, defaultTutorialTask } from '../fixtures/run'
import { exitTutorial, setTutorialClock, startTutorial, tutorialData } from '../session'
import { tutorialApi } from './tutorialApi'

const fetchSpy = vi.fn()
// Virtual time: the run's stage timers are scheduled together, so the test
// clock has to honour their delays rather than firing them all at once.
let now = 0
let scheduled: Array<{ at: number; run: () => void }> = []
const clock = {
  schedule: (ms: number, run: () => void) => void scheduled.push({ at: now + ms, run }),
  cancelAll: () => void (scheduled = []),
}

function advance(ms: number) {
  now += ms
  const due = scheduled.filter((entry) => entry.at <= now)
  scheduled = scheduled.filter((entry) => entry.at > now)
  for (const entry of due) entry.run()
}

beforeEach(() => {
  exitTutorial()
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
  now = 0
  scheduled = []
  setTutorialClock(clock)
  startTutorial({ id: 'compute', steps: [{ id: 'a', route: '/app', target: 't', title: 'T', body: 'b', advanceOn: 'next' }], api: tutorialApi })
})

afterEach(() => {
  exitTutorial()
  vi.unstubAllGlobals()
})

describe('tutorial API', () => {
  it('serves the run routes without reaching the network', async () => {
    const created = await apiRequest<{ id: string }>('/ga4gh/tes/v1/tasks', {
      method: 'POST',
      body: JSON.stringify(defaultTutorialTask()),
    })
    expect(created.id).toBe(TUTORIAL_TASK_ID)

    const task = await apiRequest<TesTask>(`/ga4gh/tes/v1/tasks/${TUTORIAL_TASK_ID}`)
    expect(task.state).toBe('QUEUED')
    expect(task.name).toBe('merge-station-readings')

    const list = await apiRequest<{ tasks: TesTask[] }>('/ga4gh/tes/v1/tasks')
    expect(list.tasks).toHaveLength(1)

    const job = await apiRequest<JobStatusResponse>('/compute/jobs/01TUTORIALJOB000000000000')
    expect(job.state).toBe('queued')

    const info = await apiRequest<{ name: string }>('/ga4gh/tes/v1/service-info')
    expect(info.name).toBe('Tutorial runs')

    const documents = await apiRequest<{ documents: unknown[] }>('/metadata', { query: { path_prefix: 'runs/x' } })
    expect(documents.documents).toEqual([])

    const references = await apiRequest<{ entries: unknown[] }>('/data/staging/references')
    expect(references.entries).toEqual([])

    await apiRequest(`/ga4gh/tes/v1/tasks/${TUTORIAL_TASK_ID}:cancel`, { method: 'POST' })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a write it does not serve and never sends it', async () => {
    const refused = apiRequest('/access/groups', { method: 'POST', body: '{}' })
    await expect(refused).rejects.toMatchObject({ code: 'tutorial_write' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('hands a read it does not serve to the real client', async () => {
    // No window here, so the real client fails before fetch; what matters is
    // that the tutorial did not answer it.
    await expect(apiRequest('/access/users/me')).rejects.not.toMatchObject({ code: 'tutorial_route' })
  })

  it('echoes the submitted draft back and walks the run through its stages', async () => {
    const submitted = { ...defaultTutorialTask(), name: 'my-own-run' }
    await apiRequest('/ga4gh/tes/v1/tasks', { method: 'POST', body: JSON.stringify(submitted) })

    const stages: string[] = []
    for (let step = 0; step < 4; step++) {
      const task = await apiRequest<TesTask>(`/ga4gh/tes/v1/tasks/${TUTORIAL_TASK_ID}`)
      stages.push(task.state ?? 'UNKNOWN')
      advance(RUN_STAGE_MS)
    }

    expect(stages).toEqual(['QUEUED', 'INITIALIZING', 'RUNNING', 'COMPLETE'])
    const done = await apiRequest<TesTask>(`/ga4gh/tes/v1/tasks/${TUTORIAL_TASK_ID}`)
    expect(done.name).toBe('my-own-run')
    expect(done.logs?.[0].outputs).toHaveLength(4)
    expect(tutorialData.value.runState).toBe('COMPLETE')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('stops answering once the session ends', async () => {
    // No window here, so the real client cannot build a URL; what matters is
    // that the call is no longer served from fixtures.
    exitTutorial()

    await expect(apiRequest('/ga4gh/tes/v1/tasks')).rejects.toThrow()
  })
})
