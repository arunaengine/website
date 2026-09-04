// The compute tutorial end to end: the real run page, the real submit path and
// the real run detail, with the simulated run walking its stages on the clock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, content, element, flush, nodes, typeValue, type HostNode } from '@/test/clientRender'
import { mountTutorialCompute, settle, type TutorialMount } from '@/test/tutorialCompute'
import { RESULT_BUCKET } from '@/lib/tutorial/fixtures/data'
import { RUN_STAGE_MS } from '@/lib/tutorial/fixtures/run'
import { exitTutorial, nextTutorialStep, restartTutorial, tutorialStep } from '@/lib/tutorial/session'

let mounted: TutorialMount

function anchor(root: HostNode, id: string): HostNode {
  return element(root, (node) => node.props['data-tutorial'] === id)
}
function statusLine(): string {
  return content(anchor(mounted.root, 'run-progress'))
}

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
  await flush()
}

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

describe('compute tutorial walkthrough', () => {
  it('says up front that the run is a practice one', () => {
    expect(statusLine()).toContain('practice run')
    expect(tutorialStep.value?.id).toBe('basics')
  })

  it('starts on a seeded draft the reader can read', () => {
    const name = element(mounted.root, (node) => node.props.placeholder === 'align-and-count')
    expect(name.value).toBe('merge-station-readings')
    expect(content(anchor(mounted.root, 'run-group'))).toContain('Group')
  })

  it('reads the whole run on one page and starts it there', async () => {
    // Every section is on the page at once, so the tutorial never changes route.
    expect(content(anchor(mounted.root, 'run-executor'))).toContain('Command line')
    expect(content(anchor(mounted.root, 'run-resources'))).toContain('CPU cores')

    const review = await showRequest()
    expect(review).toContain('station-a.csv')
    expect(review).toContain('"cpu_cores": 2')
    expect(review).toContain('python:3.12-slim')

    await click(button(mounted.root, 'Run'))
    await settle()

    // The submit lands on the tutorial's own run stage, not on a real run.
    expect(mounted.router.currentRoute.value.fullPath).toBe('/app/tutorial/compute?stage=run')
    expect(mounted.fetchSpy).not.toHaveBeenCalled()
  })

  it('walks the run through its four states as the clock advances', async () => {
    await runTheDraft()

    const states = [statusLine()]
    for (let stage = 0; stage < 3; stage++) {
      await advance(RUN_STAGE_MS)
      states.push(statusLine())
    }

    expect(states.map(stageWord)).toEqual(['Pending', 'Preparing', 'Running', 'Completed'])
    expect(mounted.fetchSpy).not.toHaveBeenCalled()
  })

  it('starts a run when the stage is reached through the card', async () => {
    // Next instead of the Run button must not leave the stage without a run.
    while (tutorialStep.value && !tutorialStep.value.route.includes('stage=run')) {
      nextTutorialStep()
      await settle()
    }
    await flush()

    const states = [statusLine()]
    for (let stage = 0; stage < 3; stage++) {
      await advance(RUN_STAGE_MS)
      states.push(statusLine())
    }

    expect(states.map(stageWord)).toEqual(['Pending', 'Preparing', 'Running', 'Completed'])
    expect(mounted.fetchSpy).not.toHaveBeenCalled()
  })

  it('shows the logs, the request and the artifacts of the finished run', async () => {
    await runTheDraft()
    // Past the last stage, plus a poll of the panel's own five second timer.
    await advance(RUN_STAGE_MS * 4)

    const stages = content(anchor(mounted.root, 'run-executors'))
    expect(stages).toContain('python:3.12-slim')
    expect(stages).toContain('merged 1440 readings from 2 stations')

    const details = content(anchor(mounted.root, 'run-details'))
    expect(details).toContain('Created')
    expect(details).toContain('2 cores')
    expect(details).toContain('4 GB RAM')

    const artifacts = anchor(mounted.root, 'run-artifacts')
    expect(content(artifacts)).toContain('plot.png')
    expect(content(artifacts)).toContain('summary.json')
    expect(content(artifacts)).toContain('run.log')
    expect(content(artifacts)).toContain('model.bin')
    expect(previewButtons(artifacts)).toHaveLength(4)
    expect(mounted.fetchSpy).not.toHaveBeenCalled()
  })

  it('previews a captured artifact through the shared viewer', async () => {
    await runTheDraft()
    await advance(RUN_STAGE_MS * 4)

    await click(previewButtons(anchor(mounted.root, 'run-artifacts'))[0])

    expect(content(mounted.root)).toContain(`preview ${RESULT_BUCKET}/runs/plot.png`)
  })

  it('puts the draft back when the reader starts again', async () => {
    const nameField = element(mounted.root, (node) => node.props.placeholder === 'align-and-count')
    await typeValue(nameField, 'my own attempt')
    expect(await showRequest()).toContain('my own attempt')

    restartTutorial()
    await settle()

    expect(tutorialStep.value?.id).toBe('basics')
    const review = content(anchor(mounted.root, 'run-review'))
    expect(review).toContain('merge-station-readings')
    expect(review).not.toContain('my own attempt')
  })

  it('hands the reader back to Compute when the session ends', async () => {
    // Exit and Escape both end the session; neither may strand the reader.
    exitTutorial()
    await settle()

    expect(mounted.router.currentRoute.value.name).toBe('compute')
  })

  it('keeps the run detail reachable after a step back and forward', async () => {
    await runTheDraft()

    // The reader can go back to the form without losing the run.
    await mounted.router.push('/app/tutorial/compute')
    await settle()
    expect(content(anchor(mounted.root, 'run-executor'))).toContain('Command line')

    await mounted.router.push('/app/tutorial/compute?stage=run')
    await settle()
    await advance(RUN_STAGE_MS * 4)

    expect(content(anchor(mounted.root, 'run-artifacts'))).toContain('plot.png')
  })
})

function stageWord(line: string): string {
  return ['Pending', 'Preparing', 'Running', 'Completed'].find((word) => line.includes(word)) ?? line
}

function previewButtons(root: HostNode): HostNode[] {
  return nodes(root).filter(
    (node) => node.tag === 'button' && String(node.props['aria-label'] ?? '').startsWith('Preview '),
  )
}

/** Starts the seeded draft from the page's own Run button. */
async function runTheDraft() {
  await click(button(mounted.root, 'Run'))
  await settle()
}

/** Opens the request dialog and answers with the body it shows. */
async function showRequest(): Promise<string> {
  await click(button(mounted.root, 'Show request'))
  await settle()
  return content(anchor(mounted.root, 'run-review'))
}
