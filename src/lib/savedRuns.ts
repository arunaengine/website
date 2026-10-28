// "My runs": runs a person saved to start again, kept only in this browser or desktop app.
// A saved run is the run request as it was, plus which inputs and whether the results folder
// are asked again each time. A file export carries them to another computer.
import type { TesTask } from '@/lib/tes'

export interface SavedRun {
  id: string
  name: string
  savedAt: string
  task: TesTask
  ask: {
    /** Container paths of the inputs chosen again at each start. */
    inputs: string[]
    results: boolean
  }
}

const STORE = 'aruna.myRuns'
const FORMAT = 'aruna-my-runs'

/** The run request without what only a finished run has. */
export function savedTask(task: TesTask): TesTask {
  const { id: _id, state: _state, logs: _logs, creation_time: _created, ...rest } = task
  return rest
}

function isSavedRun(value: unknown): value is SavedRun {
  const run = value as Partial<SavedRun> | null
  return Boolean(
    run && typeof run.id === 'string' && typeof run.name === 'string' && typeof run.savedAt === 'string'
      && run.task && typeof run.task === 'object' && Array.isArray(run.task.executors)
      && run.ask && Array.isArray(run.ask.inputs) && run.ask.inputs.every((path) => typeof path === 'string')
      && typeof run.ask.results === 'boolean',
  )
}

/** The saved runs of this browser; an unreadable store reads as none. */
export function readSavedRuns(storage: Storage | undefined = globalThis.localStorage): SavedRun[] {
  try {
    const parsed = JSON.parse(storage?.getItem(STORE) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter(isSavedRun) : []
  } catch {
    return []
  }
}

export function writeSavedRuns(runs: readonly SavedRun[], storage: Storage | undefined = globalThis.localStorage) {
  storage?.setItem(STORE, JSON.stringify(runs))
}

/** The runs with one added, or replaced when its id is known. */
export function withRun(runs: readonly SavedRun[], run: SavedRun): SavedRun[] {
  return runs.some((item) => item.id === run.id) ? runs.map((item) => (item.id === run.id ? run : item)) : [...runs, run]
}

export function exportRuns(runs: readonly SavedRun[]): string {
  return JSON.stringify({ format: FORMAT, version: 1, runs }, null, 2)
}

/** The runs with those of an exported file added; a run with a known id replaces it. */
export function importRuns(text: string, runs: readonly SavedRun[]): SavedRun[] {
  let parsed: { format?: unknown; runs?: unknown }
  try {
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    throw new Error('This file is not a saved runs file.')
  }
  if (parsed?.format !== FORMAT || !Array.isArray(parsed.runs)) throw new Error('This file is not a saved runs file.')
  const found = parsed.runs.filter(isSavedRun)
  if (found.length !== parsed.runs.length) throw new Error('Some runs in this file are not readable.')
  return found.reduce<SavedRun[]>((all, run) => withRun(all, run), [...runs])
}

/** What a saved run asks for at each start, in words: input names and the results folder. */
export function askedFor(run: SavedRun): string[] {
  const names = run.ask.inputs.map((path) => {
    const input = run.task.inputs?.find((item) => item.path === path)
    return input?.name || path.split('/').filter(Boolean).pop() || path
  })
  return run.ask.results ? [...names, 'results folder'] : names
}
