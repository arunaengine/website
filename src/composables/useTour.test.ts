import { beforeEach, describe, expect, it } from 'vitest'
import type { Router } from 'vue-router'
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
  pushed.length = 0
  route.value = { fullPath: '/app' }
  bindTourRouter(router)
})

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

  it('clears its state when stopped', () => {
    startTour(STEPS)
    stopTour()

    expect(tourActive.value).toBe(false)
    expect(tourIndex.value).toBe(0)
    expect(tourCount.value).toBe(0)
    expect(currentStep.value).toBeNull()
  })
})
