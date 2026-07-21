import { PROCESS_RUN_PROFILE_URI } from './profiles/builtinProfiles'

// Parses the backend's Process Run Crate into the dedicated run UI model.
// Returns null unless the root declares the exact profile and references a
// CreateAction, so other crates retain the generic rendering.

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

export interface RunCrateInstrument {
  id: string
  name?: string
  identifier?: string
  version?: string
}

export interface RunCrateContainer {
  id: string
  name?: string
  reference?: string
  registry?: string
  tag?: string
  sha256?: string
  url?: string
}

export interface RunCrateModel {
  runId?: string
  name?: string
  actionName?: string
  command?: string
  instrument?: RunCrateInstrument
  container?: RunCrateContainer
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
const WORKSPACE_PROPERTY_ID = 'https://w3id.org/aruna/terms/workspace-bucket'
const WFRUN = 'https://w3id.org/ro/terms/workflow-run#'

function fileRef(id: string, byId: Map<string, Record<string, unknown>>): RunCrateFileRef {
  const entity = byId.get(id)
  const fallbackName = id.startsWith(WORKSPACE_PREFIX)
    ? id.slice(WORKSPACE_PREFIX.length)
    : (id.split('/').filter(Boolean).pop() ?? id)
  return {
    id,
    name: stringOf(entity?.name) || fallbackName,
    contentSize: stringOf(entity?.contentSize),
    contentUrl: stringOf(entity?.contentUrl),
  }
}

function instrumentOf(
  value: unknown,
  byId: Map<string, Record<string, unknown>>,
): RunCrateInstrument | undefined {
  const id = idOf(value)
  if (!id) return undefined
  const entity = byId.get(id)
  const direct = id.startsWith('#') ? undefined : id
  const name = stringOf(entity?.name)
  const identifier = stringOf(entity?.identifier) ?? direct
  const version = stringOf(entity?.softwareVersion)
  return name || identifier || version ? { id, name, identifier, version } : undefined
}

function containerOf(
  value: unknown,
  byId: Map<string, Record<string, unknown>>,
): RunCrateContainer | undefined {
  const id = idOf(value)
  if (!id) return undefined
  const entity = byId.get(id)
  const direct = id.startsWith('#') ? undefined : id
  const name = stringOf(entity?.name)
  const reference = stringOf(entity?.identifier) ?? direct
  const registry = stringOf(entity?.registry ?? entity?.[`${WFRUN}registry`])
  const tag = stringOf(entity?.tag ?? entity?.[`${WFRUN}tag`])
  const sha256 = stringOf(entity?.sha256 ?? entity?.[`${WFRUN}sha256`])
  const rawUrl = stringOf(entity?.url)
  const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : undefined
  return name || reference || registry || tag || sha256 || url
    ? { id, name, reference, registry, tag, sha256, url }
    : undefined
}

function workspaceOf(
  value: unknown,
  byId: Map<string, Record<string, unknown>>,
): string | undefined {
  for (const id of refIdsOf(value)) {
    const property = byId.get(id)
    if (stringOf(property?.propertyID) === WORKSPACE_PROPERTY_ID) return stringOf(property?.value)
  }
  return undefined
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
  if (!refIdsOf(root?.conformsTo).includes(PROCESS_RUN_PROFILE_URI)) return null
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
    name: stringOf(root?.name),
    actionName: stringOf(action.name),
    command: stringOf(action.description),
    instrument: instrumentOf(action.instrument, byId),
    container: containerOf(action.containerImage ?? action[`${WFRUN}containerImage`], byId),
    actionStatus: actionStatusOf(action.actionStatus),
    startTime: stringOf(action.startTime),
    endTime: stringOf(action.endTime),
    error: stringOf(action.error),
    agent,
    workspaceBucket: workspaceOf(action.additionalProperty, byId),
    inputs: refIdsOf(action.object).map((id) => fileRef(id, byId)),
    outputs: refIdsOf(action.result).map((id) => fileRef(id, byId)),
  }
}
