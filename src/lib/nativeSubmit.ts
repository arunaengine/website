// Maps the wizard's GA4GH task draft onto the native POST /jobs/ body.
//
// The facade fixes what TES cannot express: it always snapshots or mounts
// inputs, never pins a version, sends no output prefixes, and leaves the
// collision policy at `reject`. A run that needs any of those has to go
// through the native surface, and this is the one place that translation
// lives, so it can be tested without a component or a network.
import { parseS3Url, type TesTask } from '@/lib/tes'
import type {
  CollisionPolicyRequest,
  ExecutionInputRequest,
  ExecutionOutputRequest,
  InputModeRequest,
  SubmitExecutionRequest,
  WorkspaceRequest,
} from '@/lib/jobs'

export interface InputPlacement {
  mode: InputModeRequest
  /** Required by exact_reference, refused by floating_reference. */
  versionId?: string
}

export interface NativePlacementOptions {
  /** Keyed by container path, which the wizard already keeps unique. */
  inputs: Record<string, InputPlacement>
  collisionPolicy: CollisionPolicyRequest
  outputPrefixes: string[]
  workspace: WorkspaceRequest | null
}

export interface NativeSubmitForm {
  groupId: string
  task: TesTask
  executorConstraint?: string
  placement: NativePlacementOptions
  idempotencyKey?: string
}

/**
 * `unsupported` means the draft itself cannot be expressed natively, so the
 * advanced options stay switched off. `invalid` means a native-only field is
 * filled in wrongly and the user can fix it.
 */
export type NativeBlockKind = 'unsupported' | 'invalid'

export interface NativeBlocked {
  blocked: string
  kind: NativeBlockKind
}

export type NativeMapping = { request: SubmitExecutionRequest } | NativeBlocked

export function isNativeBlocked(mapping: NativeMapping): mapping is NativeBlocked {
  return 'blocked' in mapping
}

export function defaultPlacement(): NativePlacementOptions {
  return { inputs: {}, collisionPolicy: 'reject', outputPrefixes: [], workspace: null }
}

/**
 * Whether the draft needs the native surface. Omitting `workspace` natively
 * defaults to `kept`, so only `temporary` and `existing` need it; the other
 * three options each have no GA4GH equivalent at all.
 */
export function nativeSubmitRequired(placement: NativePlacementOptions): boolean {
  const pinned = Object.values(placement.inputs).some(
    (input) => input.mode !== 'snapshot' || Boolean(input.versionId?.trim()),
  )
  return (
    pinned
    || placement.collisionPolicy !== 'reject'
    || placement.outputPrefixes.some((prefix) => prefix.trim())
    || placement.workspace?.mode === 'temporary'
    || placement.workspace?.mode === 'existing'
  )
}

// Last path segment; the s3 key's own last segment is the fallback for a
// container path that ends in a separator.
function destKey(containerPath: string, key: string): string {
  const fromPath = containerPath.split('/').filter(Boolean).pop()
  return fromPath || key.split('/').filter(Boolean).pop() || ''
}

function mapInput(
  input: { url?: string; content?: string; path: string; type?: string },
  placement: NativePlacementOptions,
): ExecutionInputRequest | NativeBlocked {
  if (input.content !== undefined) {
    return { blocked: 'An input carries inline content, which no submission surface accepts.', kind: 'unsupported' }
  }
  if (input.type && input.type !== 'FILE') {
    return { blocked: 'A directory input cannot be submitted; add its files instead.', kind: 'unsupported' }
  }
  const parsed = input.url ? parseS3Url(input.url) : null
  if (!parsed) {
    return {
      blocked: `The input ${input.url || input.path} is not an s3://bucket/key reference.`,
      kind: 'unsupported',
    }
  }
  const containerPath = input.path.trim()
  const chosen = placement.inputs[containerPath] ?? { mode: 'snapshot' as InputModeRequest }
  const versionId = chosen.versionId?.trim() || undefined
  if (chosen.mode === 'exact_reference' && !versionId) {
    return { blocked: `${containerPath} pins an exact version but names none.`, kind: 'invalid' }
  }
  if (chosen.mode === 'floating_reference' && versionId) {
    return {
      blocked: `${containerPath} follows the current version, so it cannot also name one.`,
      kind: 'invalid',
    }
  }
  const key = destKey(containerPath, parsed.key)
  if (!key) {
    return { blocked: `${containerPath} gives no destination key.`, kind: 'invalid' }
  }
  const mapped: ExecutionInputRequest = {
    bucket: parsed.bucket,
    key: parsed.key,
    dest_key: key,
    container_path: containerPath,
    mode: chosen.mode,
  }
  if (versionId) mapped.version_id = versionId
  return mapped
}

function mapOutput(output: {
  url: string
  path: string
  path_prefix?: string
  type?: string
}): ExecutionOutputRequest | NativeBlocked {
  const containerPath = output.path.trim()
  if (output.type === 'DIRECTORY' || containerPath.endsWith('/')) {
    return {
      blocked: `The folder capture ${containerPath} cannot be submitted; capture its files instead.`,
      kind: 'unsupported',
    }
  }
  // Folder captures reach here as `<folder>/*` plus the prefix to strip, which
  // the native request body has no field for.
  if (output.path_prefix) {
    return {
      blocked: `The folder capture ${output.path_prefix}/ has no native equivalent; capture its files instead.`,
      kind: 'unsupported',
    }
  }
  const parsed = parseS3Url(output.url)
  if (!parsed) {
    return { blocked: `The output ${output.url} is not an s3://bucket/key destination.`, kind: 'unsupported' }
  }
  return { container_path: containerPath, dest_key: parsed.key }
}

// The backend reads ram_gb as decimal GB and truncates, so this matches it
// exactly rather than using binary units.
function ramBytes(gb: number | undefined): number | undefined {
  if (gb === undefined || !Number.isFinite(gb) || gb <= 0) return undefined
  const bytes = Math.floor(gb * 1_000_000_000)
  return bytes > 0 ? bytes : undefined
}

export function tesFormToExecutionRequest(form: NativeSubmitForm): NativeMapping {
  const { task, placement } = form
  if (!form.groupId.trim()) return { blocked: 'Select the owning group first.', kind: 'invalid' }
  if (task.volumes?.length) {
    return { blocked: 'Declared volumes have no native equivalent.', kind: 'unsupported' }
  }
  if (task.executors.length !== 1) {
    return {
      blocked: task.executors.length
        ? 'A job runs exactly one executor; this draft declares several.'
        : 'The draft declares no executor.',
      kind: 'unsupported',
    }
  }
  const executor = task.executors[0]

  const inputs: ExecutionInputRequest[] = []
  for (const input of task.inputs ?? []) {
    const mapped = mapInput(input, placement)
    if ('blocked' in mapped) return mapped
    inputs.push(mapped)
  }
  const outputs: ExecutionOutputRequest[] = []
  for (const output of task.outputs ?? []) {
    const mapped = mapOutput(output)
    if ('blocked' in mapped) return mapped
    outputs.push(mapped)
  }

  const request: SubmitExecutionRequest = {
    group_id: form.groupId.trim(),
    image: executor.image.trim(),
    command: executor.command.filter((argument) => argument !== ''),
    env: executor.env ?? {},
    inputs,
    outputs,
    output_prefixes: placement.outputPrefixes.map((prefix) => prefix.trim()).filter(Boolean),
    collision_policy: placement.collisionPolicy,
  }
  const cpu = task.resources?.cpu_cores
  if (cpu !== undefined && Number.isInteger(cpu) && cpu > 0) request.cpu_cores = cpu
  const ram = ramBytes(task.resources?.ram_gb)
  if (ram !== undefined) request.ram_bytes = ram
  const constraint = form.executorConstraint?.trim()
  if (constraint) request.executor_constraint = constraint
  const key = form.idempotencyKey?.trim()
  if (key) request.idempotency_key = key
  // `kept` is the backend's own default for an omitted block, so it is left out.
  if (placement.workspace && placement.workspace.mode !== 'kept') {
    request.workspace =
      placement.workspace.mode === 'existing'
        ? { mode: 'existing', bucket: placement.workspace.bucket?.trim() }
        : { mode: placement.workspace.mode }
  }
  return { request }
}

/** Native submission carries no disk ceiling, so a disk request is dropped. */
export function droppedNativeFields(task: TesTask): string[] {
  const dropped: string[] = []
  if (task.resources?.disk_gb !== undefined) dropped.push('disk request')
  if (task.resources?.preemptible) dropped.push('preemptible flag')
  if (task.description?.trim()) dropped.push('description')
  return dropped
}
