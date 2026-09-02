import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiInterceptor } from './interceptor'
import {
  backTutorialStep,
  bindTutorialRouter,
  exitTutorial,
  nextTutorialStep,
  restartTutorial,
  scheduleTutorial,
  setTutorialClock,
  setTutorialData,
  startTutorial,
  syncTutorialRoute,
  tutorialActive,
  tutorialCount,
  tutorialData,
  tutorialIndex,
  tutorialStatus,
  tutorialStep,
  type TutorialStep,
} from './session'

const STEPS: TutorialStep[] = [
  { id: 'basics', route: '/app/tutorial/compute', target: 'run-name', title: 'Name', body: 'b', advanceOn: 'next' },
  { id: 'group', route: '/app/tutorial/compute', target: 'run-group', title: 'Group', body: 'b', advanceOn: 'action' },
  { id: 'work', route: '/app/tutorial/compute?step=1', target: 'run-executor', title: 'Work', body: 'b', advanceOn: 'next' },
]

const pushed: string[] = []
const route = { value: { fullPath: '/app/tutorial/compute' } }
const router = {
  currentRoute: route,
  push: (to: string) => {
    pushed.push(to)
    route.value = { fullPath: to }
  },
}

// Timers the test runs by hand, so nothing is left pending after a cancel.
const scheduled: Array<() => void> = []
const clock = {
  schedule: (_ms: number, run: () => void) => void scheduled.push(run),
  cancelAll: () => void (scheduled.length = 0),
}

const api = vi.fn(async () => ({}))

function start() {
  startTutorial({ id: 'compute', steps: STEPS, api })
}

beforeEach(() => {
  exitTutorial()
  setTutorialClock(clock)
  bindTutorialRouter(router)
  pushed.length = 0
  scheduled.length = 0
  route.value = { fullPath: '/app/tutorial/compute' }
})

describe('tutorial session', () => {
  it('opens on the first step and answers the API itself', () => {
    start()

    expect(tutorialActive.value).toBe(true)
    expect(tutorialIndex.value).toBe(0)
    expect(tutorialCount.value).toBe(3)
    expect(tutorialStep.value?.id).toBe('basics')
    expect(apiInterceptor()).toBe(api)
    expect(pushed).toEqual([])
  })

  it('ignores a tutorial without steps', () => {
    startTutorial({ id: 'profile', steps: [], api })

    expect(tutorialActive.value).toBe(false)
    expect(apiInterceptor()).toBeNull()
  })

  it('walks back to a step whose route differs only in its query', () => {
    // Comparing paths alone would strand the reader on the later wizard step.
    start()
    nextTutorialStep()
    nextTutorialStep()
    expect(pushed).toEqual(['/app/tutorial/compute?step=1'])

    backTutorialStep()

    expect(tutorialStep.value?.id).toBe('group')
    expect(pushed).toEqual(['/app/tutorial/compute?step=1', '/app/tutorial/compute'])
  })

  it('holds the first step on a step back', () => {
    start()
    backTutorialStep()

    expect(tutorialIndex.value).toBe(0)
  })

  it('ends on the last step instead of wrapping', () => {
    start()
    nextTutorialStep()
    nextTutorialStep()
    nextTutorialStep()

    expect(tutorialStatus.value).toBe('done')
    expect(tutorialIndex.value).toBe(2)
  })

  it('advances an action step only on the next step route', () => {
    start()
    nextTutorialStep()

    syncTutorialRoute('/app/tutorial/compute?stage=run')
    expect(tutorialIndex.value).toBe(1)

    syncTutorialRoute('/app/tutorial/compute?step=1')
    expect(tutorialIndex.value).toBe(2)
  })

  it('leaves no pending work when it exits', () => {
    start()
    const ran = vi.fn()
    scheduleTutorial(10, ran)
    setTutorialData({ runState: 'RUNNING' })

    exitTutorial()

    expect(scheduled).toEqual([])
    expect(apiInterceptor()).toBeNull()
    expect(tutorialActive.value).toBe(false)
    expect(tutorialData.value).toEqual({})
    expect(ran).not.toHaveBeenCalled()
  })

  it('puts the draft and the run back on a restart', () => {
    const reset = vi.fn()
    startTutorial({ id: 'compute', steps: STEPS, api, reset })
    nextTutorialStep()
    nextTutorialStep()
    scheduleTutorial(10, vi.fn())
    setTutorialData({ runState: 'COMPLETE', startedMs: 1 })

    restartTutorial()

    expect(reset).toHaveBeenCalledTimes(1)
    expect(tutorialIndex.value).toBe(0)
    expect(tutorialData.value).toEqual({})
    expect(scheduled).toEqual([])
    expect(apiInterceptor()).toBe(api)
  })
})
