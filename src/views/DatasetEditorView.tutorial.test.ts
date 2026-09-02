import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, content, element, nodes, typeValue, type HostNode } from '@/test/clientRender'
import {
  markTutorialDone,
  mountTutorialProfile,
  settle,
  type TutorialMount,
} from '@/test/tutorialProfile'
import { TUTORIAL_PROFILE_SLUG } from '@/lib/tutorial/fixtures/profile'
import { exitTutorial, nextTutorialStep, tutorialStep } from '@/lib/tutorial/session'

interface CrateNode {
  '@id': string
  '@type': string | string[]
  [property: string]: unknown
}

let mounted: TutorialMount

/** The draft as the editor would send it, read from the JSON-LD it renders. */
function draftGraph(): CrateNode[] {
  const code = element(mounted.root, (node) => node.tag === 'code')
  return (JSON.parse(content(code)) as { '@graph': CrateNode[] })['@graph']
}

function rootNode(): CrateNode {
  return draftGraph().find((entry) => entry['@id'] === './') as CrateNode
}

function personNode(): CrateNode | undefined {
  return draftGraph().find((entry) => String(entry['@type']).includes('Person'))
}

function field(label: string): HostNode {
  return element(mounted.root, (node) => node.props['aria-label'] === label)
}

function row(entityId: string, property: string): HostNode {
  return element(mounted.root, (node) => node.props['data-row'] === `${entityId}:${property}`)
}

function saveButton(): HostNode {
  return button(mounted.root, 'Create dataset')
}

/** Buttons the check panel offers per refused entity. */
function jumpButtons(): HostNode[] {
  return nodes(mounted.root).filter(
    (node) => node.tag === 'button' && ['Open', 'Open dataset'].includes(content(node).trim()),
  )
}

/** Opens the bar that lists everything still outstanding. */
async function openDrawer() {
  await press(element(mounted.root, (node) => node.props['aria-expanded'] === false))
}

/** Jumps to the entity the line of the open bar names. */
async function jumpTo(name: string) {
  const line = element(mounted.root, (node) => node.tag === 'p' && content(node).trim() === name)
  await press(button(line.parent as HostNode, 'Open'))
}

async function type(node: HostNode, value: string) {
  await typeValue(node, value)
  await settle()
}

async function press(node: HostNode) {
  const handler = node.props.onClick as (event: unknown) => unknown
  await handler({ target: node })
  await settle()
}

// Waits for state the view reaches on its own, bounded so a lost update fails
// the test rather than hanging it.
async function until(predicate: () => boolean, what: string) {
  for (let turn = 0; turn < 40 && !predicate(); turn++) {
    await vi.advanceTimersByTimeAsync(100)
    await settle()
  }
  expect(predicate(), what).toBe(true)
}

/** Walks the builder stage the way the reader does, ending in the editor. */
async function reachEditor() {
  await mounted.router.push('/app/tutorial/profile?step=3')
  await settle()
  for (let step = 0; step < 7; step++) {
    nextTutorialStep()
    await settle()
  }
  await press(button(mounted.root, 'Create profile'))
  expect(tutorialStep.value?.id).toBe('pick')
}

/** Walks the overlay's own Next to a later stop on the same stage. */
async function advanceTo(id: string) {
  for (let turn = 0; turn < 10 && tutorialStep.value?.id !== id; turn++) {
    nextTutorialStep()
    await settle()
  }
  expect(tutorialStep.value?.id).toBe(id)
}

async function pickTutorialProfile() {
  await type(field('Profile'), TUTORIAL_PROFILE_SLUG)
  await until(() => Boolean(personNode()), 'the profile rules seeded a Person')
}

beforeEach(async () => {
  vi.useFakeTimers()
  mounted = await mountTutorialProfile()
})

afterEach(() => {
  exitTutorial()
  mounted.app.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the dataset editor under the tutorial', () => {
  it('seeds the rows the profile requires', async () => {
    await reachEditor()
    expect(rootNode().conformsTo).toBeUndefined()

    await pickTutorialProfile()

    // Declaring the profile, one row per required property, and the Person the
    // Creator rule asks for.
    expect(JSON.stringify(rootNode().conformsTo)).toContain('w3id.org/aruna/profile/')
    expect(rootNode().creator).toEqual({ '@id': personNode()!['@id'] })
    expect(personNode()!.name).toBeUndefined()
  })

  it('refuses the draft until every required value is answered', async () => {
    await reachEditor()
    await pickTutorialProfile()
    const personId = personNode()!['@id']

    // Every rule of the profile is checked as it is typed, and nothing goes to
    // the node while one of them is unanswered.
    expect(saveButton().props.disabled).toBe(true)
    await type(field('Dataset name'), 'Station survey 2026')
    await type(field('Dataset description'), 'Readings from two stations.')
    expect(jumpButtons()).toEqual([])
    expect(saveButton().props.disabled).toBe(true)

    await type(row('./', 'license'), 'https://creativecommons.org/licenses/by/4.0/')

    // The Person the profile added is still nameless, which its shape requires.
    expect(saveButton().props.disabled).toBe(true)
    await openDrawer()
    expect(content(mounted.root)).toContain('requires Name on the person')

    // The bar leaves the root form, so the Person is named from its own editor.
    await jumpTo(personId)
    await type(row(personId, 'name'), 'Ada Lovelace')

    await until(() => content(mounted.root).includes('would accept this dataset'), 'the node checked the draft')
    expect(jumpButtons()).toEqual([])
    expect(saveButton().props.disabled).toBe(false)
    expect(mounted.fetchSpy).not.toHaveBeenCalled()
  })

  it('finishes the tutorial on a simulated save', async () => {
    await reachEditor()
    await pickTutorialProfile()
    await type(field('Dataset name'), 'Station survey 2026')
    await type(field('Dataset description'), 'Readings from two stations.')
    await type(row('./', 'license'), 'https://creativecommons.org/licenses/by/4.0/')
    const personId = personNode()!['@id']
    await openDrawer()
    await jumpTo(personId)
    await type(row(personId, 'name'), 'Ada Lovelace')
    await until(() => saveButton().props.disabled === false, 'the draft can be saved')
    await advanceTo('save')

    await press(saveButton())
    await until(
      () => mounted.router.currentRoute.value.fullPath === '/app/tutorial/profile?stage=saved',
      'the save landed on the closing stage',
    )
    expect(tutorialStep.value?.id).toBe('done')

    nextTutorialStep()
    await settle()

    expect(markTutorialDone).toHaveBeenCalledTimes(1)
    expect(markTutorialDone).toHaveBeenCalledWith('profile')
    expect(mounted.router.currentRoute.value.name).toBe('profiles')
    expect(mounted.fetchSpy).not.toHaveBeenCalled()
  })
})
