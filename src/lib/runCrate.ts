// Parses the run crate the backend writes for finished execution jobs
// (aruna operations/src/jobs/workflow/run_crate.rs): an RO-Crate graph whose
// Dataset root `mentions` a `#run-{jobId}` CreateAction with agent (Person),
// instrument (container image), object (workspace/{key} input refs), result
// (workspace/{key} output refs backed by File entities) and actionStatus.
// Returns null when no CreateAction parses so callers fall back to the
// generic crate rendering.

export interface RunCrateFileRef {
  id: string
  name: string
  contentSize?: string
  contentUrl?: string
}

export interface RunCrateAgent {
  id: string
  name?: string
  identifier?: string
}

export interface RunCrateModel {
  runId?: string
  actionName?: string
  image?: string
  command: string[]
  actionStatus?: string
  startTime?: string
  endTime?: string
  error?: string
  agent?: RunCrateAgent
  workspaceBucket?: string
  inputs: RunCrateFileRef[]
  outputs: RunCrateFileRef[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function graphOf(crate: unknown): Array<Record<string, unknown>> {
  if (!isRecord(crate)) return []
  const graph = crate['@graph']
  return Array.isArray(graph) ? graph.filter(isRecord) : []
}

function typesOf(entity: Record<string, unknown>): string[] {
  const t = entity['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

function idOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return idOf(value[0])
  if (isRecord(value)) return idOf(value['@id'])
  return undefined
}

function stringOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return stringOf(value[0])
  if (isRecord(value)) return stringOf(value['@id'])
  return undefined
}

function stringListOf(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : []
  if (Array.isArray(value)) return value.flatMap(stringListOf)
  return []
}

function refIdsOf(value: unknown): string[] {
  const refs = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : []
  const ids: string[] = []
  for (const ref of refs) {
    const id = idOf(ref)
    if (id) ids.push(id)
  }
  return ids
}

const WORKSPACE_PREFIX = 'workspace/'

function fileRef(id: string, byId: Map<string, Record<string, unknown>>): RunCrateFileRef {
  const entity = byId.get(id)
  const fallbackName = id.startsWith(WORKSPACE_PREFIX) ? id.slice(WORKSPACE_PREFIX.length) : id
  return {
    id,
    name: stringOf(entity?.name) || fallbackName,
    contentSize: stringOf(entity?.contentSize),
    contentUrl: stringOf(entity?.contentUrl),
  }
}

// Actual crates carry the schema.org local name; tolerate full IRIs too.
function actionStatusOf(value: unknown): string | undefined {
  const raw = stringOf(value)
  if (!raw) return undefined
  const slash = raw.lastIndexOf('/')
  return slash >= 0 ? raw.slice(slash + 1) : raw
}

export function parseRunCrate(crate: unknown, documentPath: string): RunCrateModel | null {
  const graph = graphOf(crate)
  if (!graph.length) return null
  const byId = new Map<string, Record<string, unknown>>()
  for (const entity of graph) {
    const id = entity['@id']
    if (typeof id === 'string' && !byId.has(id)) byId.set(id, entity)
  }

  const descriptor = byId.get('ro-crate-metadata.json')
  const rootId = idOf(descriptor?.about)
  const root = rootId ? byId.get(rootId) : undefined
  const mentionedId = idOf(root?.mentions)
  const mentioned = mentionedId ? byId.get(mentionedId) : undefined
  const action =
    mentioned && typesOf(mentioned).includes('CreateAction')
      ? mentioned
      : graph.find((entity) => typesOf(entity).includes('CreateAction'))
  if (!action) return null

  const actionId = typeof action['@id'] === 'string' ? action['@id'] : ''
  const runId = actionId.startsWith('#run-')
    ? actionId.slice('#run-'.length)
    : documentPath.startsWith('runs/')
      ? documentPath.slice('runs/'.length)
      : undefined

  const agentId = idOf(action.agent)
  const agentEntity = agentId ? byId.get(agentId) : undefined
  const agent: RunCrateAgent | undefined = agentId
    ? { id: agentId, name: stringOf(agentEntity?.name), identifier: stringOf(agentEntity?.identifier) }
    : undefined

  return {
    runId,
    actionName: stringOf(action.name),
    image: stringOf(action.instrument),
    command: stringListOf(action.command),
    actionStatus: actionStatusOf(action.actionStatus),
    startTime: stringOf(action.startTime),
    endTime: stringOf(action.endTime),
    error: stringOf(action.error),
    agent,
    // Deterministic bucket name, mirroring JobRecord::workspace_bucket_name.
    workspaceBucket: runId ? `ws-${runId.toLowerCase()}` : undefined,
    inputs: refIdsOf(action.object).map((id) => fileRef(id, byId)),
    outputs: refIdsOf(action.result).map((id) => fileRef(id, byId)),
  }
}
