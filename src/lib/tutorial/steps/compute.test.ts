import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flush, nodes, type HostNode } from '@/test/clientRender'
import { mountTutorialCompute, settle, type TutorialMount } from '@/test/tutorialCompute'
import { RUN_STAGE_MS } from '../fixtures/run'
import {
  backTutorialStep,
  exitTutorial,
  nextTutorialStep,
  tutorialIndex,
  tutorialStep,
} from '../session'
import { computeTutorialSteps } from './compute'

function anchors(root: HostNode): string[] {
  return nodes(root)
    .map((node) => node.props['data-tutorial'])
    .filter((value): value is string => typeof value === 'string')
}

let mounted: TutorialMount

beforeEach(async () => {
  vi.useFakeTimers()
  mounted = await mountTutorialCompute()
})

afterEach(() => {
  exitTutorial()
  mounted.app.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('compute tutorial steps', () => {
  it('declares a coherent step list', () => {
    for (const step of computeTutorialSteps) {
      expect(step.route.startsWith('/app/tutorial/compute')).toBe(true)
      expect(step.target).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(0)
    }
    const ids = computeTutorialSteps.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('spotlights a control the step actually renders', async () => {
    // Walk the tutorial as a reader would: every stop must find its anchor in
    // the tree that stop mounts.
    const missing: string[] = []
    for (let step = 0; step < computeTutorialSteps.length; step++) {
      const current = tutorialStep.value
      expect(current?.id).toBe(computeTutorialSteps[step].id)
      await flush()
      // The submitted run walks its stages while the reader reads.
      await vi.advanceTimersByTimeAsync(RUN_STAGE_MS * 4)
      await flush()
      if (!anchors(mounted.root).includes(current!.target)) missing.push(current!.id)
      if (step + 1 < computeTutorialSteps.length) {
        nextTutorialStep()
        await settle()
      }
    }

    expect(missing).toEqual([])
  })

  it('lets the reader step back through the wizard', async () => {
    for (let step = 0; step < 4; step++) {
      nextTutorialStep()
      await settle()
    }
    expect(tutorialIndex.value).toBe(4)

    backTutorialStep()
    await settle()
    backTutorialStep()
    await settle()

    expect(tutorialStep.value?.id).toBe('filesystem')
    expect(mounted.router.currentRoute.value.fullPath).toBe('/app/tutorial/compute?step=1')
    expect(anchors(mounted.root)).toContain('run-filesystem')
  })
})
