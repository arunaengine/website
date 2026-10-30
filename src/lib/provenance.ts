// Where data came from, read one link at a time with the user's own access. Each box is a record
// the node answered; a link the user may not read is named by its global id or content id only.
import { ApiError, type OriginIdentifier, type OriginResponse, type RunResponse } from '@/lib/api'
import { isContentId, isExactId } from '@/lib/crate/dataIdentity'
import { formatDate } from '@/lib/utils'

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
  /** The full name of a file whose title shows only its last part. */
  path?: string
  identifiers: OriginIdentifier[]
  /** A run's crate document, a source link or a database's dataset. */
  link?: { label: string; document?: string; url?: string }
  /** A database release: the database's name and the release label, for a box of its files. */
  release?: { name: string; label: string }
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

/** A file's box titled by the last part of its name, such as a container path. */
function fileNamed(id: string, kind: BoxKind, role: string, name: string, extra: Partial<Box> = {}): Box {
  const last = name.replace(/\/+$/, '').split('/').pop() || name
  return box(id, kind, role, last, last === name ? extra : { ...extra, path: name })
}

// The last part of the key a versioned id names; null for any other id.
function keyName(id: string): string | null {
  const arn = /s3\/[^/]+\/(.+)@[0-9A-Z]{26}$/.exec(id)
  if (!arn) return null
  const key = decodeURIComponent(arn[1])
  return key.split('/').pop() || key
}

// A run input's box name: the stored file's name ("genome.fasta") for a bare input name
// ("genome"); a container path keeps its own name, whose last part is the title anyway.
function inputName(input: { name: string; exact: string | null }): string {
  return input.name.includes('/') || !input.exact ? input.name : (keyName(input.exact) ?? input.name)
}

/** The last part of a key in a versioned id, or a short form of any other id. */
export function shortName(id: string): string {
  const key = keyName(id)
  if (key) return key
  const tail = id.replace(DATA_PREFIX, '')
  return tail.length > 20 ? `${tail.slice(0, 8)}…${tail.slice(-6)}` : tail
}

/** The node and bucket a versioned object id names; null for a global or content id. */
export function bucketOf(id: string): string | null {
  const arn = /arn:aruna:[^:/]+:([^:/]+):s3\/([^/]+)\//.exec(id)
  return arn ? `${arn[1]}/${arn[2]}` : null
}

function add(graph: Graph, parent: string | null, child: Box): string {
  graph.boxes[child.id] ??= child
  if (parent && !graph.boxes[parent].from.includes(child.id)) graph.boxes[parent].from.push(child.id)
  if (!parent && !graph.roots.includes(child.id)) graph.roots.push(child.id)
  return child.id
}

/** A file's box, with its database and source added at once and its other links waiting. */
function fileBox(graph: Graph, parent: string | null, id: string, asked: string, role: string, name: string, origin: OriginResponse) {
  const file = fileNamed(id, 'file', role, name, { detail: formatDate(origin.created_at) })
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
    const unchecked = origin.releases_complete === false ? 'Release membership could not be checked everywhere.' : undefined
    const releases = origin.releases ?? []
    // A release that pins this exact version names it; one box per release file version.
    for (const release of releases) {
      const upstream = release.upstream[0]
      const named = box(`release:${release.crate_version}`, 'database', 'Database release', `${title} ${release.label}`, {
        detail: unchecked,
        release: { name: title, label: release.label },
        ...(upstream ? { link: { label: upstream.name === 'DOI' ? `doi:${upstream.value}` : upstream.value, url: upstream.url } } : {}),
      })
      add(graph, id, named)
    }
    if (releases.length) return addSource(graph, id, kind, origin)
    // One box per bucket; a file known only by a global id gets its own, never one by title.
    const database = box(`database:${bucketOf(asked) ?? id}`, 'database', 'Bucket with database metadata', title, { detail: unchecked })
    if (metadata.dataset) database.link = { label: 'Open the dataset', document: metadata.dataset }
    add(graph, id, database)
  }
  addSource(graph, id, kind, origin)
}

function addSource(graph: Graph, id: string, kind: string | undefined, origin: OriginResponse) {
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
  fileBox(graph, null, canonical, id, 'This file', name, origin)
}

/** Starts at a dataset: each file part with an exact version waits to be read. */
export function startDataset(graph: Graph, title: string, documentId: string, crate: unknown) {
  const root = box(`dataset:${documentId}`, 'file', 'Dataset', title, { link: { label: 'Open the dataset', document: documentId } })
  add(graph, null, root)
  // A run record lists its run's inputs as parts too; with results they show through the run only.
  const actions = graphNodes(crate).filter((node) => isType(node, 'CreateAction'))
  const results = new Set(actions.flatMap((action) => values(action.result)))
  const inputs = new Set(actions.flatMap((action) => values(action.object)).filter((id) => !results.has(id)))
  const action = actions.find((node) => values(node.result).length)
  const run = action ? seedRun(graph, action, crate) : null
  // The run hangs from the dataset on its own, so its inputs show even when no result can be read.
  if (run) add(graph, root.id, run)
  for (const part of dataParts(crate)) {
    if (run && inputs.has(part.id)) continue
    if (part.exact) root.pending.push({ kind: 'version', id: part.exact, name: part.name, digest: part.id, role: 'File' })
    else {
      const file = add(graph, root.id, fileNamed(part.id, 'unversioned', 'File', part.name, { detail: 'No exact version recorded' }))
      if (run && results.has(part.id)) add(graph, file, run)
    }
  }
}

/**
 * The run of a loaded run record, with its inputs waiting, so they keep a path before any result
 * is read. A result's origin names the run by its job id, the `#run-<job id>` of the crate.
 */
function seedRun(graph: Graph, action: Record<string, unknown>, crate: unknown): Box {
  const runId = String(action['@id']).replace(/^#run-/, '')
  const id = `run:${runId}`
  graph.boxes[id] ??= box(id, 'run', 'Run', typeof action.name === 'string' ? action.name : `Run ${shortName(runId)}`)
  graph.seen[id] = id
  for (const input of runInputs(crate).parts) {
    if (input.exact) graph.boxes[id].pending.push({ kind: 'version', id: input.exact, name: inputName(input), digest: input.id, role: 'Input file' })
    else add(graph, id, fileNamed(input.id, 'unversioned', 'Input file', input.name, { detail: 'No exact version recorded' }))
  }
  return graph.boxes[id]
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
      else fileBox(graph, boxId, canonical, hop.id, hop.role, hop.name ?? shortName(hop.id), origin)
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
      if (input.exact) created.pending.push({ kind: 'version', id: input.exact, name: inputName(input), digest: input.id, role: 'Input file' })
      else add(graph, id, fileNamed(input.id, 'unversioned', 'Input file', input.name, { detail: 'No exact version recorded' }))
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

/** One entry of the drawn chain: a box, or sibling files folded because they share their sources. */
export interface DrawnNode {
  key: string
  ids: string[]
  /** Drawn before in the chain, so its sources are not drawn again. */
  repeat: boolean
  sources: DrawnNode[]
}

/**
 * The chain as drawn: sibling files that came from the same boxes fold into one entry, and a box
 * reached again is drawn without its sources, so a shared chain shows once.
 */
export function drawnChain(graph: Graph): DrawnNode[] {
  const drawn = new Set<string>()
  const walk = (ids: string[], trail: string[]): DrawnNode[] => {
    const before = new Set(drawn)
    const groups = new Map<string, string[]>()
    for (const id of ids) {
      const item = graph.boxes[id]
      // A box already on this path is not drawn again, so a cycle ends.
      if (!item || trail.includes(id)) continue
      const from = [...item.from].sort().join('\n')
      const leaf = (item.kind === 'file' || item.kind === 'unversioned') && !from
      const key = item.kind === 'file' && from ? `${item.role}\n${from}` : leaf ? `leaf:${item.kind}\n${item.role}` : `box:${id}`
      groups.set(key, [...(groups.get(key) ?? []), id])
    }
    // Files with no sources fold only when there are many of them.
    const folds = [...groups].flatMap(([key, members]) => (key.startsWith('leaf:') && members.length <= 3 ? members.map((id) => [id]) : [members]))
    // Runs follow the files beside them, so a file's chain through a run is drawn first, and a box
    // that an earlier sibling's chain drew is left out here.
    const isRun = (members: string[]) => graph.boxes[members[0]!]!.kind === 'run'
    const ordered = folds.sort((a, b) => Number(isRun(a)) - Number(isRun(b)))
    return ordered.flatMap((members) => {
      if (members.every((id) => drawn.has(id) && !before.has(id))) return []
      const repeat = members.every((id) => drawn.has(id))
      for (const id of members) drawn.add(id)
      const first = graph.boxes[members[0]!]!
      return { key: members.join('\n'), ids: members, repeat, sources: repeat ? [] : walk(first.from, [...trail, ...members]) }
    })
  }
  return walk(graph.roots, [])
}

/** A run record's chain: result files that came only from its run fold into the record's card. */
export function intoRecord(graph: Graph, chain: DrawnNode[]): DrawnNode[] {
  return chain.map((root) => {
    const start = graph.boxes[root.ids[0]!]
    const run = start?.id.startsWith('dataset:') ? start.from.find((id) => graph.boxes[id]?.kind === 'run') : undefined
    if (!run) return root
    const result = (node: DrawnNode) => node.ids.every((id) => graph.boxes[id]?.from.join() === run)
    const sources = root.sources.flatMap((node) => (result(node) ? node.sources : [node]))
    const runs = sources.filter((node) => node.ids[0] === run)
    const kept = runs.find((node) => !node.repeat) ?? runs[0]
    return { ...root, sources: sources.filter((node) => node.ids[0] !== run || node === kept) }
  })
}

/** A card of the chain in columns: sources at the left, the start in the last column. */
export interface ChainCard {
  /** Unique per card, also for a box drawn twice. */
  id: string
  node: DrawnNode
  column: number
  /** A card with sources sits about halfway between its first and last source, on a half row. */
  row: number
  /** The card this one leads into. */
  into: string | null
  /** Whether its sources are drawn. */
  open: boolean
}

/** Places the drawn chain in columns; `direct` keeps the start, its runs and their inputs only. */
export function chainColumns(graph: Graph, chain: DrawnNode[], direct: boolean) {
  const isRun = (node: DrawnNode) => graph.boxes[node.ids[0]!]?.kind === 'run'
  const placed: (Omit<ChainCard, 'column'> & { depth: number })[] = []
  let next = 0
  const place = (node: DrawnNode, depth: number, into: string | null, underRun: boolean): number => {
    const id = `${into ?? ''}>${node.key}`
    const open = !direct || (!underRun && (depth === 0 || isRun(node)))
    const rows = (open ? node.sources : []).map((source) => place(source, depth + 1, id, underRun || isRun(node)))
    const row = rows.length ? Math.round(rows[0]! + rows[rows.length - 1]!) / 2 : next++
    placed.push({ id, node, depth, row, into, open })
    return row
  }
  for (const root of chain) place(root, 0, null, false)
  const deepest = Math.max(0, ...placed.map((card) => card.depth))
  const cards: ChainCard[] = placed.map(({ depth, ...card }) => ({ ...card, column: deepest - depth }))
  return { cards, columns: deepest + 1, rows: Math.max(1, next) }
}

/** Whether any box still has links to read. */
export const hasPending = (graph: Graph) => Object.values(graph.boxes).some((item) => item.pending.length && item.kind !== 'silent')
