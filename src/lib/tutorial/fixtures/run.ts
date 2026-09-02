// The simulated run: its four stages, the task record each stage serves, and
// the native job behind it. The task the user submitted is merged in, so the
// detail panel shows the draft they actually built.
import type { JobStatusResponse } from '@/lib/jobs'
import type { TesState, TesTask, TesTaskLog } from '@/lib/tes'
import { TES_EXECUTOR_TAG, TES_GROUP_TAG, TES_JOB_ID_TAG } from '@/lib/tes'
import {
  INPUT_BUCKET,
  RESULT_ARTIFACTS,
  RESULT_BUCKET,
  RUN_LOG_TEXT,
  TUTORIAL_GROUP,
} from './data'

export const TUTORIAL_TASK_ID = 'tutorial-run-0001'
export const TUTORIAL_JOB_ID = '01TUTORIALJOB000000000000'

/** Stage order of the simulated run and how long each one lasts. */
export const RUN_STAGES: TesState[] = ['QUEUED', 'INITIALIZING', 'RUNNING', 'COMPLETE']
export const RUN_STAGE_MS = 6000

// Plain words for the stage, so the tutorial never makes the reader translate
// the wire vocabulary of either surface.
const STAGE_LABEL: Partial<Record<TesState, string>> = {
  QUEUED: 'Pending',
  INITIALIZING: 'Preparing',
  RUNNING: 'Running',
  COMPLETE: 'Completed',
}

export function runStageLabel(state: TesState | undefined): string {
  return STAGE_LABEL[state ?? 'QUEUED'] ?? 'Pending'
}

const NATIVE_STATE: Partial<Record<TesState, JobStatusResponse['state']>> = {
  QUEUED: 'queued',
  INITIALIZING: 'preparing',
  RUNNING: 'running',
  COMPLETE: 'succeeded',
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

/** The draft the tutorial starts from, when the user never submitted one. */
export function defaultTutorialTask(): TesTask {
  return {
    name: 'merge-station-readings',
    description: 'Merge two stations of survey readings into one summary.',
    inputs: [
      { name: 'station-a.csv', url: `s3://${INPUT_BUCKET}/survey-2026/station-a.csv`, path: '/inputs/station-a.csv', type: 'FILE' },
      { name: 'station-b.csv', url: `s3://${INPUT_BUCKET}/survey-2026/station-b.csv`, path: '/inputs/station-b.csv', type: 'FILE' },
    ],
    outputs: [
      { url: `s3://${RESULT_BUCKET}/runs/summary.json`, path: '/outputs/summary.json', type: 'FILE' },
      { url: `s3://${RESULT_BUCKET}/runs/plot.png`, path: '/outputs/plot.png', type: 'FILE' },
    ],
    resources: { cpu_cores: 2, ram_gb: 4, disk_gb: 10 },
    executors: [{ image: 'python:3.12-slim', command: ['python', '/inputs/merge.py'], workdir: '/work' }],
    tags: { [TES_GROUP_TAG]: TUTORIAL_GROUP.id },
  }
}

function taskLog(state: TesState, startedMs: number): TesTaskLog[] {
  if (state !== 'RUNNING' && state !== 'COMPLETE') return []
  const running = state === 'RUNNING'
  return [
    {
      start_time: iso(startedMs + RUN_STAGE_MS * 2),
      ...(running ? {} : { end_time: iso(startedMs + RUN_STAGE_MS * 3) }),
      logs: [
        {
          start_time: iso(startedMs + RUN_STAGE_MS * 2),
          ...(running ? {} : { end_time: iso(startedMs + RUN_STAGE_MS * 3), exit_code: 0 }),
          stdout: running ? RUN_LOG_TEXT.split('\n').slice(0, 2).join('\n') : RUN_LOG_TEXT,
          stderr: '',
        },
      ],
      outputs: running
        ? []
        : RESULT_ARTIFACTS.map((artifact) => ({
            url: `s3://${RESULT_BUCKET}/${artifact.key}`,
            path: `/outputs/${artifact.name}`,
            size_bytes: String(artifact.size),
          })),
      system_logs: [`placed on the ${TUTORIAL_GROUP.name} executor`, 'staged 2 inputs'],
    },
  ]
}

export interface TutorialRunState {
  state?: TesState
  startedMs?: number
  submitted?: TesTask
}

/** The task record the TES routes serve for the run's current stage. */
export function tutorialTask(run: TutorialRunState): TesTask {
  const state = run.state ?? 'QUEUED'
  const startedMs = run.startedMs ?? 0
  const submitted = run.submitted ?? defaultTutorialTask()
  return {
    ...submitted,
    id: TUTORIAL_TASK_ID,
    state,
    creation_time: iso(startedMs),
    tags: {
      ...submitted.tags,
      [TES_JOB_ID_TAG]: TUTORIAL_JOB_ID,
      [TES_EXECUTOR_TAG]: submitted.tags?.[TES_EXECUTOR_TAG] ?? 'docker',
    },
    logs: taskLog(state, startedMs),
  }
}

/** The native job the facade created for the run. */
export function tutorialJob(run: TutorialRunState): JobStatusResponse {
  const state = run.state ?? 'QUEUED'
  const startedMs = run.startedMs ?? 0
  const done = state === 'COMPLETE'
  return {
    job_id: TUTORIAL_JOB_ID,
    kind: 'execution',
    state: NATIVE_STATE[state] ?? 'queued',
    attempts: 1,
    cancel_requested: false,
    created_at: iso(startedMs),
    updated_at: iso(startedMs + RUN_STAGE_MS * RUN_STAGES.indexOf(state)),
    ...(done ? { finished_at: iso(startedMs + RUN_STAGE_MS * 3) } : {}),
    progress: { current: done ? 2 : 0, total: 2, unit: 'inputs' },
    workspace_mode: 'none',
    locally_exhausted: false,
  }
}
