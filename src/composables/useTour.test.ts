import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import { docsTopicBySlug } from '@/docs/v1'
import { flush } from '@/test/clientRender'
import {
  bindTourRouter,
  currentStep,
  nextStep,
  prevStep,
  startTour,
  stopTour,
  tourActive,
  tourCount,
  tourIndex,
  type TourStep,
} from './useTour'

const desktop = vi.hoisted(() => ({ on: false }))
vi.mock('@/lib/desktop', () => ({ isDesktop: () => desktop.on }))

const STEPS: TourStep[] = [
  { route: '/app', anchor: 'top-search', title: 'Search', body: 'Find datasets, objects, groups and users.' },
  { route: '/app/groups', anchor: 'groups-create', title: 'Groups', body: 'Create the group that owns the data.' },
]

const pushed: string[] = []
const route = { value: { fullPath: '/app' } }
const router = {
  currentRoute: route,
  push: async (to: string) => {
    pushed.push(to)
    route.value = { fullPath: to }
  },
} as unknown as Router

beforeEach(() => {
  stopTour()
  desktop.on = false
  pushed.length = 0
  route.value = { fullPath: '/app' }
  bindTourRouter(router)
})

afterEach(() => {
  stopTour()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// A page that lays out only the named anchors.
function pageWith(anchors: string[]) {
  const box = { top: 10, left: 10, width: 40, height: 20 }
  vi.stubGlobal('document', {
    querySelectorAll: (selector: string) =>
      anchors.some((anchor) => selector === `[data-tour="${anchor}"]`)
        ? [{ getBoundingClientRect: () => box, scrollIntoView: () => undefined }]
        : [],
  })
}

const stop = (anchor: string): TourStep => ({ route: '/app', anchor, title: anchor, body: 'Look here.' })

describe('guided tour', () => {
  it('opens on the first step', () => {
    startTour(STEPS)

    expect(tourActive.value).toBe(true)
    expect(tourIndex.value).toBe(0)
    expect(tourCount.value).toBe(2)
    expect(currentStep.value?.anchor).toBe('top-search')
  })

  it('ignores a tour without steps', () => {
    startTour([])

    expect(tourActive.value).toBe(false)
    expect(currentStep.value).toBeNull()
  })

  it('advances and ends after the last step', async () => {
    startTour(STEPS)
    nextStep()
    await flush()

    expect(tourIndex.value).toBe(1)
    expect(currentStep.value?.anchor).toBe('groups-create')

    nextStep()

    expect(tourActive.value).toBe(false)
    expect(tourCount.value).toBe(0)
  })

  it('holds the first step on a step back', () => {
    startTour(STEPS)
    prevStep()

    expect(tourIndex.value).toBe(0)
    nextStep()
    prevStep()
    expect(tourIndex.value).toBe(0)
  })

  it('navigates only to a route it is not on', async () => {
    startTour(STEPS)
    await flush()
    expect(pushed).toEqual([])

    nextStep()
    await flush()
    expect(pushed).toEqual(['/app/groups'])
  })

  it('walks back to a step whose route differs only in its query', async () => {
    // Comparing paths alone leaves the wizard on the later step forever.
    const wizard: TourStep[] = [
      { route: '/app/compute/quick', anchor: 'quickrun-runtime', title: 'Runtime', body: 'Pick one.' },
      { route: '/app/compute/quick?step=1', anchor: 'quickrun-script', title: 'Script', body: 'Write it.' },
    ]
    startTour(wizard)
    await flush()
    nextStep()
    await flush()
    prevStep()
    await flush()

    expect(pushed).toEqual(['/app/compute/quick', '/app/compute/quick?step=1', '/app/compute/quick'])
  })

  it('skips a step whose control is not shown and counts only the rest', async () => {
    vi.useFakeTimers()
    pageWith(['top-search', 'context-switcher'])
    startTour([stop('top-search'), stop('top-create-dataset'), stop('context-switcher')])
    nextStep()
    await flush()
    expect(currentStep.value?.anchor).toBe('top-create-dataset')

    vi.advanceTimersByTime(5000)
    await flush()

    expect(tourCount.value).toBe(2)
    expect(tourIndex.value).toBe(1)
    expect(currentStep.value?.anchor).toBe('context-switcher')
    prevStep()
    expect(currentStep.value?.anchor).toBe('top-search')
  })

  it('skips back past a missing control to the step before it', async () => {
    vi.useFakeTimers()
    pageWith(['top-search', 'top-account'])
    startTour([stop('top-search'), stop('nav-groups'), stop('top-account')])
    nextStep()
    nextStep()
    await flush()
    prevStep()
    vi.advanceTimersByTime(5000)
    await flush()

    expect(tourCount.value).toBe(2)
    expect(tourIndex.value).toBe(0)
    expect(currentStep.value?.anchor).toBe('top-search')
  })

  it('ends when the last step has no control to show', async () => {
    vi.useFakeTimers()
    pageWith(['top-search'])
    startTour([stop('top-search'), stop('top-create-dataset')])
    nextStep()
    vi.advanceTimersByTime(5000)
    await flush()

    expect(tourActive.value).toBe(false)
  })

  it('leaves a control the desktop never shows out of its tour only', () => {
    const tour = docsTopicBySlug('portal-tour')?.tour ?? []
    const walk = () => {
      const seen: string[] = []
      while (tourActive.value) {
        seen.push(currentStep.value?.anchor ?? '')
        nextStep()
      }
      return seen
    }

    desktop.on = true
    startTour(tour)
    expect(tourCount.value).toBe(tour.length - 1)
    expect(walk()).not.toContain('top-create-dataset')

    desktop.on = false
    startTour(tour)
    expect(tourCount.value).toBe(tour.length)
    expect(walk()).toContain('top-create-dataset')
  })

  it('clears its state when stopped', () => {
    startTour(STEPS)
    stopTour()

    expect(tourActive.value).toBe(false)
    expect(tourIndex.value).toBe(0)
    expect(tourCount.value).toBe(0)
    expect(currentStep.value).toBeNull()
  })
})
