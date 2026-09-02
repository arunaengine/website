// Answers the API calls the compute tutorial's surfaces make. A path this table
// does not know is handed back to the client, which forwards a read and
// refuses a write, so an active session never changes anything on a node.
import type { ApiRequestOptions } from '@/lib/api'
import type { TesTask } from '@/lib/tes'
import {
  RUN_STAGES,
  RUN_STAGE_MS,
  TUTORIAL_JOB_ID,
  TUTORIAL_TASK_ID,
  tutorialJob,
  tutorialTask,
} from '../fixtures/run'
import { scheduleTutorial, setTutorialData, tutorialData } from '../session'

const TES_ROOT = '/ga4gh/tes/v1'

function run() {
  const data = tutorialData.value
  return { state: data.runState, startedMs: data.startedMs, submitted: data.submittedTask }
}

function parseTask(body: BodyInit | null | undefined): TesTask | undefined {
  if (typeof body !== 'string') return undefined
  try {
    return JSON.parse(body) as TesTask
  } catch {
    return undefined
  }
}

/** Accepts the run and walks it through its stages on the session clock. */
function startRun(submitted: TesTask | undefined) {
  const startedMs = Date.now()
  setTutorialData({ runState: RUN_STAGES[0], startedMs, submittedTask: submitted })
  RUN_STAGES.slice(1).forEach((state, position) => {
    scheduleTutorial(RUN_STAGE_MS * (position + 1), () => setTutorialData({ runState: state }))
  })
}

export function tutorialApi(path: string, options: ApiRequestOptions = {}): Promise<unknown> | null {
  const method = (options.method ?? 'GET').toUpperCase()

  if (path === `${TES_ROOT}/service-info`) {
    return Promise.resolve({
      id: 'org.aruna.tutorial',
      name: 'Tutorial runs',
      type: { group: 'org.ga4gh', artifact: 'tes', version: '1.1' },
      organization: { name: 'Aruna tutorial', url: 'https://aruna-storage.org' },
      version: '1.1',
    })
  }

  if (path === `${TES_ROOT}/tasks`) {
    if (method === 'POST') {
      startRun(parseTask(options.body))
      return Promise.resolve({ id: TUTORIAL_TASK_ID })
    }
    return Promise.resolve({ tasks: tutorialData.value.runState ? [tutorialTask(run())] : [] })
  }

  if (path.startsWith(`${TES_ROOT}/tasks/`)) {
    if (path.endsWith(':cancel')) return Promise.resolve({})
    return Promise.resolve(tutorialTask(run()))
  }

  // The native submission surface, for a draft the standard interface cannot
  // carry; the tutorial follows it on the same run detail either way.
  if (path === '/compute/jobs' && method === 'POST') {
    startRun(parseTask(options.body))
    return Promise.resolve({
      job_id: TUTORIAL_JOB_ID,
      canonical_job_id: TUTORIAL_JOB_ID,
      created: true,
      state: 'queued',
      origin_node_url: '',
      status_url: '',
    })
  }
  if (path === '/compute/jobs') return Promise.resolve({ jobs: [] })
  if (path.startsWith('/compute/jobs/')) return Promise.resolve(tutorialJob(run()))

  // A simulated run writes no dataset and references nothing.
  if (path === '/metadata') {
    return Promise.resolve({ documents: [], limit: 1, offset: 0, total_returned: 0 })
  }
  if (path === '/data/staging/references') return Promise.resolve({ entries: [] })

  return null
}
