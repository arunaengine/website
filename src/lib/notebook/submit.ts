// Builds the POST /compute/jobs body of a notebook session. A session names a
// catalog runtime instead of an image, works in one durable group bucket, and
// stages the dependency list the portal wrote beside the notebook.
import { placementTags } from '@/lib/tes'
import { TES_NETWORK_TAG } from '@/lib/quickRuntimes'
import type { ExecutionInputRequest, SubmitExecutionRequest } from '@/lib/jobs'
import type { NotebookPlacement, NotebookResources } from './nbformat'
import { dependencyFileName } from './runtimes'

/** Marks the job as the session behind one notebook. */
export const SESSION_TAG = 'aruna-engine.org/session'
export const SESSION_TAG_VALUE = 'notebook'
/** Placement label that pins a run to one node. */
export const NODE_LABEL_KEY = 'aruna-engine.org/node'

export interface SessionSubmitDraft {
  groupId: string
  /** Shown in the run list; the notebook name reads well here. */
  name: string
  runtime: string
  workspaceBucket: string
  /** Key of the dependency list in the workspace bucket, empty when there is none. */
  dependencyKey?: string
  dependencyKind?: 'requirements' | 'deno'
  resources?: NotebookResources
  placement?: NotebookPlacement
  idempotencyKey: string
  /** A shorter idle timeout than the realm's; the node clamps it. */
  idleAfterMs?: number
}

export function placementLabels(placement: NotebookPlacement | undefined): Record<string, string> {
  const labels: Record<string, string> = { ...(placement?.labels ?? {}) }
  const node = placement?.node?.trim()
  if (node) labels[NODE_LABEL_KEY] = node
  return labels
}

export function sessionSubmitRequest(draft: SessionSubmitDraft): SubmitExecutionRequest {
  const inputs: ExecutionInputRequest[] = []
  if (draft.dependencyKey && draft.dependencyKind) {
    inputs.push({
      bucket: draft.workspaceBucket,
      key: draft.dependencyKey,
      dest_key: dependencyFileName(draft.dependencyKind),
    })
  }
  const request: SubmitExecutionRequest = {
    group_id: draft.groupId.trim(),
    // The node fills image, entrypoint and command from the runtime catalog.
    image: '',
    command: [],
    env: {},
    tags: {
      [SESSION_TAG]: SESSION_TAG_VALUE,
      // Installing declared dependencies needs the network open at start.
      ...(inputs.length ? { [TES_NETWORK_TAG]: 'open' } : {}),
      ...placementTags(placementLabels(draft.placement)),
    },
    workdir: null,
    inputs,
    outputs: [],
    collision_policy: 'reject',
    workspace: { mode: 'existing', bucket: draft.workspaceBucket },
    runtime: draft.runtime,
  }
  const name = draft.name.trim()
  if (name) request.name = name
  const cpu = draft.resources?.cpu_cores
  if (cpu !== undefined && Number.isInteger(cpu) && cpu > 0) request.cpu_cores = cpu
  const ram = draft.resources?.ram_bytes
  if (ram !== undefined && Number.isFinite(ram) && ram > 0) request.ram_bytes = Math.floor(ram)
  const kind = draft.placement?.executor_kind?.trim()
  if (kind) request.executor_constraint = kind
  const key = draft.idempotencyKey.trim()
  if (key) request.idempotency_key = key
  if (draft.idleAfterMs !== undefined && draft.idleAfterMs > 0) {
    request.session_idle_after_ms = Math.floor(draft.idleAfterMs)
  }
  return request
}

/** What the session submit still needs, in plain words. */
export function sessionProblems(
  draft: Pick<SessionSubmitDraft, 'groupId' | 'workspaceBucket' | 'runtime'>,
): string[] {
  const problems: string[] = []
  if (!draft.groupId.trim()) problems.push('Pick the group that owns the session.')
  if (!draft.workspaceBucket.trim()) problems.push('Pick the bucket the notebook works in.')
  if (!draft.runtime.trim()) problems.push('Pick a runtime.')
  return problems
}
