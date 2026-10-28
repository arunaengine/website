// Where data came from, read one link at a time with the user's own access. Each box is a record
// the node answered; a link the user may not read is named by its global id or content id only.
import { ApiError, type OriginIdentifier, type OriginResponse, type RunResponse } from '@/lib/api'
import { isContentId, isExactId } from '@/lib/crate/dataIdentity'

const DATA_PREFIX = 'https://w3id.org/aruna/data/'
const GLOBAL_VERSION = /^https:\/\/w3id\.org\/aruna\/data\/[A-Za-z0-9_-]+\/[0-9A-HJKMNP-TV-Z]{26}$/

export type BoxKind = 'file' | 'run' | 'database' | 'source' | 'hidden' | 'unversioned' | 'silent'

/** A link still to read: an exact version, or a run. */
export type Hop =
  | { kind: 'version'; id: string; name?: string; digest?: string; role: string }
  | { kind: 'run'; runId: string }

export interface Box {
  id: string
  kind: BoxKind
  /** Small heading, such as "Input file". */
  role: string
  title: string
  detail?: string
  identifiers: OriginIdentifier[]
  /** A run's crate document, a source link or a database's dataset. */
  link?: { label: string; document?: string; url?: string }
  /** The boxes this one came from. */
  from: string[]
  pending: Hop[]
}

export interface Readers {
  origin: (version: string) => Promise<OriginResponse>
  run: (runId: string) => Promise<RunResponse>
  crate: (documentId: string) => Promise<unknown>
}

export type ProvenanceStart =
  | { kind: 'file'; id: string; name: string; origin: OriginResponse }
  | { kind: 'dataset'; documentId: string; title: string; crate: unknown }

export interface Graph {
  boxes: Record<string, Box>
  /** The box each asked id became, so a link read before is not read again. */
  seen: Record<string, string>
  roots: string[]
  steps: number
}

function box(id: string, kind: BoxKind, role: string, title: string, extra: Partial<Box> = {}): Box {
  return { id, kind, role, title, identifiers: [], from: [], pending: [], ...extra }
}

/** The last part of a key in a versioned id, or a short form of any other id. */
export function shortName(id: string): string {
  const arn = /s3\/[^/]+\/(.+)@[0-9A-Z]{26}$/.exec(id)
  if (arn) {
    const key = decodeURIComponent(arn[1])
    return key.split('/').pop() || key
  }
  const tail = id.replace(DATA_PREFIX, '')
  return tail.length > 20 ? `${tail.slice(0, 8)}…${tail.slice(-6)}` : tail
}

function add(graph: Graph, parent: string | null, child: Box): string {
  graph.boxes[child.id] ??= child
  if (parent && !graph.boxes[parent].from.includes(child.id)) graph.boxes[parent].from.push(child.id)
  if (!parent && !graph.roots.includes(child.id)) graph.roots.push(child.id)
  return child.id
}

/** A file's box, with its database and source added at once and its other links waiting. */
function fileBox(graph: Graph, parent: string | null, id: string, role: string, name: string, origin: OriginResponse) {
  const file = box(id, 'file', role, name, { detail: new Date(origin.created_at).toLocaleDateString() })
  const kind = origin.origin?.kind
  if (origin.origin?.kind === 'copy') file.pending.push({ kind: 'version', id: origin.origin.from, role: 'Copied from' })
  if (origin.origin?.kind === 'job') file.pending.push({ kind: 'run', runId: origin.origin.run_id })
  if (origin.hop) file.pending.push({ kind: 'version', id: origin.hop.from, role: 'Synced from' })
  add(graph, parent, file)
  // Identifiers belong to this file; the database box is shared by every file it lists.
  file.identifiers = origin.identifiers ?? []
  const metadata = origin.bucket_metadata
  if (metadata?.database) {
    const title = metadata.title || 'A database'
    const database = box(`database:${metadata.dataset || title}`, 'database', 'Bucket with database metadata', title)
    if (metadata.dataset) database.link = { label: 'Open the dataset', document: metadata.dataset }
    add(graph, id, database)
  }
  const url = kind === 'source' ? origin.source?.url : null
  if (url) {
    const title = (() => {
      try {
        return new URL(url).host
      } catch {
        return url
      }
    })()
    add(graph, id, box(`source:${url}`, 'source', 'Source', title, { link: { label: 'Open the source', url } }))
  }
}

export function emptyGraph(): Graph {
  return { boxes: {}, seen: {}, roots: [], steps: 0 }
}

/** Starts at a file whose origin is already read; `id` is its exact version id. */
export function startFile(graph: Graph, id: string, name: string, origin: OriginResponse) {
  const canonical = origin.global_id || id
  graph.seen[id] = canonical
  fileBox(graph, null, canonical, 'This file', name, origin)
}

/** Starts at a dataset: each file part with an exact version waits to be read. */
export function startDataset(graph: Graph, title: string, documentId: string, crate: unknown) {
  const root = box(`dataset:${documentId}`, 'file', 'Dataset', title, { link: { label: 'Open the dataset', document: documentId } })
  add(graph, null, root)
  for (const part of dataParts(crate)) {
    if (part.exact) root.pending.push({ kind: 'version', id: part.exact, name: part.name, digest: part.id, role: 'File' })
    else add(graph, root.id, box(part.id, 'unversioned', 'File', part.name, { detail: 'No exact version recorded' }))
  }
}

function graphNodes(crate: unknown): Record<string, unknown>[] {
  const graph = (crate as { '@graph'?: unknown } | null)?.['@graph']
  return Array.isArray(graph) ? (graph as Record<string, unknown>[]) : []
}

function values(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return list.flatMap((item) =>
    typeof item === 'string' ? [item] : typeof (item as { '@id'?: unknown })['@id'] === 'string' ? [(item as { '@id': string })['@id']] : [],
  )
}

function isType(node: Record<string, unknown>, type: string) {
  return values(node['@type']).includes(type)
}

interface Part {
  id: string
  name: string
  exact: string | null
}

function part(node: Record<string, unknown> | undefined, id: string): Part {
  const name = typeof node?.name === 'string' ? node.name : shortName(id)
  return { id, name, exact: values(node?.contentUrl).find(isExactId) ?? null }
}

/** The files a dataset names, with the exact version each one records, if any. */
export function dataParts(crate: unknown): Part[] {
  // A stored crate names files `MediaObject`, the term `File` stands for.
  return graphNodes(crate)
    .filter((node) => isType(node, 'File') || isType(node, 'MediaObject'))
    .map((node) => part(node, String(node['@id'])))
}

/** A run's inputs: the `object` entities of its actions. */
export function runInputs(crate: unknown): { name: string | null; parts: Part[] } {
  const nodes = graphNodes(crate)
  const byId = new Map(nodes.map((node) => [String(node['@id']), node]))
  const actions = nodes.filter((node) => isType(node, 'CreateAction'))
  const ids = [...new Set(actions.flatMap((action) => values(action.object)))]
  const name = actions.map((action) => action.name).find((value) => typeof value === 'string') as string | undefined
  return { name: name ?? null, parts: ids.map((id) => part(byId.get(id), id)) }
}

const refused = (cause: unknown) => cause instanceof ApiError && [401, 403, 404].includes(cause.status)

/** Whether the graph still belongs to the start that asked; a late answer for another is dropped. */
export type Current = () => boolean

const always: Current = () => true

/** Reads one waiting link of `boxId`. */
async function follow(graph: Graph, boxId: string, hop: Hop, readers: Readers, current: Current) {
  const asked = hop.kind === 'version' ? hop.id : `run:${hop.runId}`
  const known = graph.seen[asked]
  if (known) {
    add(graph, boxId, graph.boxes[known])
    return
  }
  graph.steps += 1
  try {
    if (hop.kind === 'version') {
      const origin = await readers.origin(hop.id)
      if (!current()) return
      const canonical = origin.global_id || hop.id
      graph.seen[asked] = canonical
      if (graph.boxes[canonical]) add(graph, boxId, graph.boxes[canonical])
      else fileBox(graph, boxId, canonical, hop.role, hop.name ?? shortName(hop.id), origin)
      return
    }
    const run = await readers.run(hop.runId)
    const crate = run.run_crate ? await readers.crate(run.run_crate) : null
    if (!current()) return
    const id = `run:${hop.runId}`
    graph.seen[asked] = id
    const { name, parts } = runInputs(crate)
    const created = box(id, 'run', 'Run', name ?? `Run ${shortName(hop.runId)}`)
    if (run.run_crate) created.link = { label: 'Open the run record', document: run.run_crate }
    else created.detail = runRecordDetail(run.run_crate_status)
    add(graph, boxId, created)
    for (const input of parts) {
      if (input.exact) created.pending.push({ kind: 'version', id: input.exact, name: input.name, digest: input.id, role: 'Input file' })
      else add(graph, id, box(input.id, 'unversioned', 'Input file', input.name, { detail: 'No exact version recorded' }))
    }
  } catch (cause) {
    if (!current()) return
    if (refused(cause)) {
      graph.seen[asked] = hiddenBox(graph, boxId, hop)
      return
    }
    const silent = box(`silent:${asked}`, 'silent', hop.kind === 'run' ? 'Run' : hop.role, 'Node did not answer', { pending: [hop] })
    add(graph, boxId, silent)
  }
}

/** Why a run shows no record: its crate state, as its node reported it to the submitter. */
export function runRecordDetail(status: RunResponse['run_crate_status']): string {
  if (status?.status === 'local') return 'Run record kept on the device'
  if (status?.status === 'denied' || status?.status === 'failed') {
    return `Run record not written: ${status.message || status.status}`
  }
  return 'No run record yet'
}

/** A link the user may not read: named by a global id or content id, never by bucket or key. */
function hiddenBox(graph: Graph, parent: string, hop: Hop): string {
  const role = hop.kind === 'run' ? 'Run' : hop.role
  const label = hop.kind === 'run' ? '' : GLOBAL_VERSION.test(hop.id) ? hop.id : isContentId(hop.digest) ? hop.digest : ''
  const id = label || `hidden:${Object.keys(graph.boxes).length}`
  const detail = label ? shortName(label) : undefined
  return add(graph, parent, box(id, 'hidden', role, 'Not visible to you', { detail }))
}

/** Reads every waiting link of one box. */
export async function expand(graph: Graph, boxId: string, readers: Readers, current: Current = always) {
  const opened = graph.boxes[boxId]
  if (!opened) return
  const hops = opened.pending.splice(0)
  if (opened.kind === 'silent') {
    // A retry replaces the box that did not answer.
    const parent = Object.values(graph.boxes).find((item) => item.from.includes(boxId))
    if (!parent) return
    parent.from = parent.from.filter((id) => id !== boxId)
    delete graph.boxes[boxId]
    for (const hop of hops) if (current()) await follow(graph, parent.id, hop, readers, current)
    return
  }
  for (const hop of hops) if (current()) await follow(graph, boxId, hop, readers, current)
}

/** Follows every link until none waits or `stopped` says so; boxes that did not answer stay. */
export async function expandAll(graph: Graph, readers: Readers, stopped: () => boolean, current: Current = always) {
  for (;;) {
    const next = Object.values(graph.boxes).find((item) => item.pending.length && item.kind !== 'silent')
    if (!next || stopped() || !current()) return
    await expand(graph, next.id, readers, current)
  }
}

/** Whether any box still has links to read. */
export const hasPending = (graph: Graph) => Object.values(graph.boxes).some((item) => item.pending.length && item.kind !== 'silent')
