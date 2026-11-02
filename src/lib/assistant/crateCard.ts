// The facts a dataset card and a run record card show, read once from the
// crate so the card and the note the model gets back always agree.
import { crateGraph, crateRootId, dataEntitiesOf, stringProp } from '@/lib/dataEntities'
import { formatCount } from '@/lib/formatCount'
import { parseRunCrate, resultsFolder, runDuration, runState, type RunCrateFileRef } from '@/lib/runCrate'
import { formatBytes } from '@/lib/utils'

export interface RunCard {
  /** succeeded, failed, running or queued; null when the crate gives none. */
  state: string | null
  startedAt?: string
  finishedAt?: string
  duration: string
  nodeId?: string
  tool?: string
  inputDatasets: Array<{ name: string; link?: string }>
  inputFiles: number
  outputFiles: number
  /** Only when every output names its size. */
  outputBytes?: number
  /** The one folder every output sits in, when they share one. */
  folder?: { bucket: string; prefix: string }
  error?: string
}

export interface DatasetCard {
  description: string
  files: number
  folders: number
  /** Only when every part is a file that names its size. */
  bytes?: number
}

const STATES: Record<string, string> = {
  ActiveActionStatus: 'running',
  PotentialActionStatus: 'queued',
}

function knownBytes(files: Array<{ contentSize?: string }>): number | undefined {
  let total = 0
  for (const file of files) {
    const size = Number(file.contentSize)
    if (file.contentSize === undefined || !Number.isFinite(size) || size < 0) return undefined
    total += size
  }
  return files.length ? total : undefined
}

// A bucket's database at admission names the dataset; a release counts only for files without one.
function inputDatasets(inputs: RunCrateFileRef[]): Array<{ name: string; link?: string }> {
  const found = new Map<string, { name: string; link?: string }>()
  for (const file of inputs) {
    const parts = file.partOf ?? []
    const database = parts.filter((part) => part.kind === 'database')
    for (const part of database.length ? database : parts) {
      const name = part.name || part.id
      if (!found.has(name)) found.set(name, { name, ...(part.links[0] ? { link: part.links[0] } : {}) })
    }
  }
  return [...found.values()]
}

/** The run record's card facts, or null when the crate is not a run record. */
export function runCard(crate: unknown): RunCard | null {
  const run = parseRunCrate(crate, '')
  if (!run) return null
  const state = runState(run)
  const folder = resultsFolder(run)
  const tool = run.instrument
    ? [run.instrument.name ?? run.instrument.identifier, run.instrument.version].filter(Boolean).join(' ')
    : [run.container?.name ?? run.container?.reference, run.container?.tag].filter(Boolean).join(':')
  return {
    state: state ? STATES[state] ?? state : null,
    ...(run.startTime ? { startedAt: run.startTime } : {}),
    ...(run.endTime ? { finishedAt: run.endTime } : {}),
    duration: runDuration(run),
    ...(run.site?.nodeId ? { nodeId: run.site.nodeId } : {}),
    ...(tool ? { tool } : {}),
    inputDatasets: inputDatasets(run.inputs),
    inputFiles: run.inputs.length,
    outputFiles: run.outputs.length,
    ...(knownBytes(run.outputs) !== undefined ? { outputBytes: knownBytes(run.outputs) } : {}),
    ...(folder ? { folder } : {}),
    ...(run.error ? { error: run.error } : {}),
  }
}

export function datasetCard(crate: unknown): DatasetCard {
  const graph = crateGraph(crate)
  const rootId = crateRootId(crate)
  const root = graph.find((entity) => entity['@id'] === rootId) ?? graph.find((entity) => entity['@id'] === './')
  const parts = dataEntitiesOf(crate)
  const files = parts.filter((part) => !part.types.includes('Dataset'))
  const folders = parts.length - files.length
  const bytes = folders ? undefined : knownBytes(files)
  return {
    description: stringProp(root?.description) ?? '',
    files: files.length,
    folders,
    ...(bytes !== undefined ? { bytes } : {}),
  }
}

/** "1,204 files" with the number and its word kept on one line. */
export function countText(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)}\u00a0${count === 1 ? one : many}`
}

export function bytesText(bytes: number): string {
  return formatBytes(bytes).replace(' ', '\u00a0')
}

/** "2 datasets, 81 files" */
export function inputsText(run: RunCard): string {
  const datasets = run.inputDatasets.length ? [countText(run.inputDatasets.length, 'dataset')] : []
  return [...datasets, countText(run.inputFiles, 'file')].join(', ')
}

/** "13 result files, 4.1 MB" */
export function outputsText(run: RunCard): string {
  const size = run.outputBytes !== undefined ? `, ${bytesText(run.outputBytes)}` : ''
  return `${countText(run.outputFiles, 'result file')}${size}`
}

/** The size row of a dataset card, or null when it holds no parts. */
export function sizeRow(dataset: DatasetCard): { label: string; value: string } | null {
  const { files, folders, bytes } = dataset
  if (folders) return { label: 'Parts', value: `${countText(folders, 'folder')}, ${countText(files, 'file')}` }
  if (!files) return null
  return bytes !== undefined
    ? { label: 'Size', value: `${bytesText(bytes)} in ${countText(files, 'file')}` }
    : { label: 'Files', value: countText(files, 'file') }
}

/** Succeeded and failed runs are settled; anything else may still change. */
export function runSettled(run: RunCard): boolean {
  return run.state === 'succeeded' || run.state === 'failed'
}
