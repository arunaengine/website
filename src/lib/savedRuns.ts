// "My runs": runs a person saved to start again, kept only in this browser or desktop app.
// A saved run is the run request as it was, plus which inputs and whether the results folder
// are asked again each time. A file export carries them to another computer.
import { TES_IDEMPOTENCY_TAG, type TesTask } from '@/lib/tes'

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

// The name parts the server's run records hide (core/src/structs/execution/job/launch.rs).
const SECRET_MARKERS = ['TOKEN', 'SECRET', 'KEY', 'PASS', 'CREDENTIAL', 'AUTH', 'PRIVATE']

/** A variable whose value is never saved and is asked again at each start. */
export const isSecretName = (name: string) => SECRET_MARKERS.some((marker) => name.toUpperCase().includes(marker))

/**
 * The run request without what only a finished run has, without secret-looking values and
 * without the idempotency key, so each start gets a fresh one.
 */
export function savedTask(task: TesTask): TesTask {
  const { id: _id, state: _state, logs: _logs, creation_time: _created, ...rest } = task
  if (rest.tags && TES_IDEMPOTENCY_TAG in rest.tags) {
    const { [TES_IDEMPOTENCY_TAG]: _key, ...tags } = rest.tags
    rest.tags = tags
  }
  const executors = rest.executors.map((executor) => ({
    ...executor,
    ...(executor.env
      ? { env: Object.fromEntries(Object.entries(executor.env).map(([name, value]) => [name, isSecretName(name) ? '' : value])) }
      : {}),
  }))
  return { ...rest, executors }
}

const withoutSecrets = (run: SavedRun): SavedRun => ({ ...run, task: savedTask(run.task) })

/** The secret-looking variables of a saved run, whose values are asked at each start. */
export const secretNames = (run: SavedRun) => Object.keys(run.task.executors[0]?.env ?? {}).filter(isSecretName)

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const listOf = (value: unknown, item: (entry: unknown) => boolean) => Array.isArray(value) && value.every(item)
const optionalList = (value: unknown, item: (entry: unknown) => boolean) => value === undefined || listOf(value, item)
const isText = (value: unknown) => typeof value === 'string'
const optional = (value: unknown, check: (entry: unknown) => boolean) => value === undefined || check(value)
const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const isFileType = (value: unknown) => value === 'FILE' || value === 'DIRECTORY'

// The fields the New run menu and the start form read, checked before a stored or imported run is used.
function isTask(value: unknown): boolean {
  if (!isObject(value)) return false
  const executor = (entry: unknown) => isObject(entry) && isText(entry.image) && listOf(entry.command, isText)
    && optional(entry.workdir, isText)
    && (entry.env === undefined || (isObject(entry.env) && Object.values(entry.env).every(isText)))
  const file = (entry: unknown) => isObject(entry) && isText(entry.path) && optional(entry.name, isText)
    && optional(entry.url, isText) && optional(entry.type, isFileType)
  const output = (entry: unknown) => isObject(entry) && isText(entry.path) && isText(entry.url)
    && optional(entry.path_prefix, isText) && optional(entry.type, isFileType)
  const resources = (entry: unknown) => isObject(entry)
    && optional(entry.cpu_cores, isNumber) && optional(entry.ram_gb, isNumber) && optional(entry.disk_gb, isNumber)
  return listOf(value.executors, executor) && (value.executors as unknown[]).length > 0
    && optionalList(value.inputs, file) && optionalList(value.outputs, output)
    && optional(value.name, isText) && optional(value.description, isText) && optional(value.resources, resources)
    && (value.tags === undefined || (isObject(value.tags) && Object.values(value.tags).every(isText)))
}

function isSavedRun(value: unknown): value is SavedRun {
  if (!isObject(value) || !isText(value.id) || !isText(value.name) || !isText(value.savedAt) || !isTask(value.task)) return false
  const ask = value.ask
  return isObject(ask) && listOf(ask.inputs, isText) && typeof ask.results === 'boolean'
}

/** The saved runs of this browser; an unreadable store reads as none. */
export function readSavedRuns(storage: Storage | undefined = globalThis.localStorage): SavedRun[] {
  try {
    const parsed = JSON.parse(storage?.getItem(STORE) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter(isSavedRun).map(withoutSecrets) : []
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
  return found.map(withoutSecrets).reduce<SavedRun[]>((all, run) => withRun(all, run), [...runs])
}

/** What a saved run asks for at each start, in words: input names and the results folder. */
export function askedFor(run: SavedRun): string[] {
  const names = run.ask.inputs.map((path) => {
    const input = run.task.inputs?.find((item) => item.path === path)
    return input?.name || path.split('/').filter(Boolean).pop() || path
  })
  const asked = [...names, ...secretNames(run)]
  return run.ask.results ? [...asked, 'results folder'] : asked
}
