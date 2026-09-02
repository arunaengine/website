import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nodes, type HostNode } from '@/test/clientRender'
import { mountTutorialProfile, settle, type TutorialMount } from '@/test/tutorialProfile'
import {
  backTutorialStep,
  exitTutorial,
  nextTutorialStep,
  restartTutorial,
  tutorialIndex,
  tutorialStep,
} from '../session'
import { profileTutorialSteps } from './profile'

function anchors(root: HostNode): string[] {
  return nodes(root)
    .map((node) => node.props['data-tutorial'])
    .filter((value): value is string => typeof value === 'string')
}

let mounted: TutorialMount

beforeEach(async () => {
  mounted = await mountTutorialProfile()
})

afterEach(() => {
  exitTutorial()
  mounted.app.unmount()
  vi.unstubAllGlobals()
})

describe('profile tutorial steps', () => {
  it('declares a coherent step list', () => {
    for (const step of profileTutorialSteps) {
      expect(step.route.startsWith('/app/tutorial/profile')).toBe(true)
      expect(step.target).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(0)
    }
    const ids = profileTutorialSteps.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('spotlights a control the step actually renders', async () => {
    // Walk the tutorial as a reader would: every stop must find its anchor in
    // the tree that stop mounts.
    const missing: string[] = []
    for (let step = 0; step < profileTutorialSteps.length; step++) {
      const current = tutorialStep.value
      expect(current?.id).toBe(profileTutorialSteps[step].id)
      await settle()
      if (!anchors(mounted.root).includes(current!.target)) missing.push(current!.id)
      if (step + 1 < profileTutorialSteps.length) {
        nextTutorialStep()
        await settle()
      }
    }

    expect(missing).toEqual([])
  })

  it('lets the reader step back through the builder', async () => {
    for (let step = 0; step < 5; step++) {
      nextTutorialStep()
      await settle()
    }
    expect(tutorialIndex.value).toBe(5)

    backTutorialStep()
    await settle()

    expect(tutorialStep.value?.id).toBe('reference')
    expect(mounted.router.currentRoute.value.fullPath).toBe('/app/tutorial/profile?step=2')
    expect(anchors(mounted.root)).toContain('profile-reference')
  })

  it('starts over on a restart', async () => {
    for (let step = 0; step < 4; step++) {
      nextTutorialStep()
      await settle()
    }

    restartTutorial()
    await settle()

    expect(tutorialIndex.value).toBe(0)
    expect(mounted.router.currentRoute.value.fullPath).toBe('/app/tutorial/profile')
    expect(anchors(mounted.root)).toContain('profile-basics')
  })

  it('hands the reader back to the profiles on an exit', async () => {
    // The builder guards an edited draft; a practice draft is not the reader's
    // to confirm, so leaving must not stop on a question.
    exitTutorial()
    await settle()

    expect(mounted.router.currentRoute.value.name).toBe('profiles')
  })
})
