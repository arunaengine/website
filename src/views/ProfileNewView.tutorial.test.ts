import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, nodes, type HostNode } from '@/test/clientRender'
import { mountTutorialProfile, settle, type TutorialMount } from '@/test/tutorialProfile'
import { exitTutorial, nextTutorialStep, tutorialStep } from '@/lib/tutorial/session'

function anchors(root: HostNode): string[] {
  return nodes(root)
    .map((node) => node.props['data-tutorial'])
    .filter((value): value is string => typeof value === 'string')
}

async function press(mounted: TutorialMount, label: string) {
  const control = button(mounted.root, label)
  expect(control.props.disabled).toBeFalsy()
  const handler = control.props.onClick as (event: unknown) => unknown
  await handler({ target: control })
  await settle()
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

describe('the profile builder under the tutorial', () => {
  it('follows the wizard the reader drives', async () => {
    // The page's own Continue moves both the wizard and the tutorial.
    expect(tutorialStep.value?.id).toBe('basics')
    expect(anchors(mounted.root)).toContain('profile-basics')
    expect(anchors(mounted.root)).not.toContain('profile-shape')

    await press(mounted, 'Next')

    expect(mounted.router.currentRoute.value.fullPath).toBe('/app/tutorial/profile?step=2')
    expect(tutorialStep.value?.id).toBe('shape')
    expect(anchors(mounted.root)).toEqual(
      expect.arrayContaining(['profile-shape', 'profile-obligation', 'profile-add-property', 'profile-reference']),
    )
    expect(anchors(mounted.root)).not.toContain('profile-basics')
  })

  it('reaches the review with the seeded rules in place', async () => {
    await press(mounted, 'Next')
    for (const _step of ['obligation', 'property', 'reference']) {
      nextTutorialStep()
      await settle()
    }
    expect(tutorialStep.value?.id).toBe('reference')

    await press(mounted, 'Next')

    expect(mounted.router.currentRoute.value.fullPath).toBe('/app/tutorial/profile?step=3')
    expect(tutorialStep.value?.id).toBe('review')
    expect(anchors(mounted.root)).toEqual(
      expect.arrayContaining(['profile-review', 'profile-visibility', 'profile-create']),
    )
  })

  it('simulates the create and moves on to the dataset', async () => {
    await mounted.router.push('/app/tutorial/profile?step=3')
    await settle()
    for (let step = 0; step < 7; step++) {
      nextTutorialStep()
      await settle()
    }
    expect(tutorialStep.value?.id).toBe('create')

    await press(mounted, 'Create profile')

    expect(mounted.router.currentRoute.value.fullPath).toBe('/app/tutorial/profile?stage=editor')
    expect(tutorialStep.value?.id).toBe('pick')
    expect(mounted.fetchSpy).not.toHaveBeenCalled()
  })

  it('lets the reader step back into the builder', async () => {
    await press(mounted, 'Next')
    expect(tutorialStep.value?.id).toBe('shape')

    await press(mounted, 'Back')

    expect(mounted.router.currentRoute.value.fullPath).toBe('/app/tutorial/profile')
    expect(anchors(mounted.root)).toContain('profile-basics')
  })
})
