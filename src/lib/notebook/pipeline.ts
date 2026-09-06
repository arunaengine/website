// A pipeline cell holds one ordinary job: the cell source is the request the
// shared task builder produced, so the same run can be read back into the small
// form the cell shows. Its outputs land in the notebook's workspace bucket.
import { buildRunTask, runExecutor, runResources } from '@/lib/runTask'
import { captureOutput } from '@/lib/tes'
import { quoteCommand, tokenizeCommand } from '@/lib/shellwords'
import { defaultPlacement, isNativeBlocked, tesFormToExecutionRequest } from '@/lib/nativeSubmit'
import type { SubmitExecutionRequest } from '@/lib/jobs'
import { NOTEBOOK_DATA_PREFIX } from './document'

export interface PipelineOutputRow {
  /** Path inside the container the file is written to. */
  path: string
  /** Key it is stored under in the workspace bucket. */
  key: string
}

/** One stored file the step reads, mounted at a path in the container. */
export interface PipelineInputRow {
  bucket: string
  key: string
  path: string
  name: string
}

export interface PipelineDraft {
  name: string
  image: string
  command: string
  cpuCores: string
  ramGb: string
  inputs: PipelineInputRow[]
  outputs: PipelineOutputRow[]
}

export interface PipelineContext {
  groupId: string
  workspaceBucket: string
  idempotencyKey: string
}

export function emptyPipelineDraft(): PipelineDraft {
  return { name: '', image: '', command: '', cpuCores: '1', ramGb: '2', inputs: [], outputs: [] }
}

export function defaultOutputKey(path: string): string {
  const file = path.split('/').filter(Boolean).pop() ?? 'result'
  return `${NOTEBOOK_DATA_PREFIX}${file}`
}

/** Where a picked object is mounted inside the container. */
export function defaultInputPath(name: string): string {
  return `/work/in/${name}`
}

export type PipelineMapping = { request: SubmitExecutionRequest } | { blocked: string }

export function pipelineRequest(draft: PipelineDraft, context: PipelineContext): PipelineMapping {
  const tokens = tokenizeCommand(draft.command)
  if (tokens.error) return { blocked: tokens.error }
  const bucket = context.workspaceBucket.trim()
  const task = buildRunTask({
    name: draft.name,
    description: '',
    groupId: context.groupId,
    idempotencyKey: context.idempotencyKey,
    executor: runExecutor({ image: draft.image, command: tokens.argv, env: [], workdir: '/work' }),
    inputs: draft.inputs
      .filter((row) => row.bucket.trim() && row.key.trim() && row.path.trim())
      .map((row) => ({
        name: row.name || row.key.split('/').filter(Boolean).pop() || 'input',
        url: `s3://${row.bucket.trim()}/${row.key.trim()}`,
        path: row.path.trim(),
        type: 'FILE' as const,
      })),
    outputs: draft.outputs
      .filter((row) => row.path.trim() && row.key.trim() && bucket)
      .map((row) => captureOutput(row.path.trim(), bucket, row.key.trim())),
    resources: runResources({ cpuCores: draft.cpuCores, ramGb: draft.ramGb, diskGb: '' }),
  })
  const mapping = tesFormToExecutionRequest({
    groupId: context.groupId,
    task,
    placement: defaultPlacement(),
    idempotencyKey: context.idempotencyKey,
  })
  if (isNativeBlocked(mapping)) return { blocked: mapping.blocked }
  // The cell works in the notebook's bucket, so its outputs land there.
  return { request: { ...mapping.request, workspace: { mode: 'existing', bucket } } }
}

/** Reads a stored pipeline cell back into the form it was built from. */
export function pipelineDraftFrom(source: string): PipelineDraft {
  const draft = emptyPipelineDraft()
  let request: Partial<SubmitExecutionRequest>
  try {
    request = JSON.parse(source || '{}') as Partial<SubmitExecutionRequest>
  } catch {
    return draft
  }
  draft.name = typeof request.name === 'string' ? request.name : ''
  draft.image = typeof request.image === 'string' ? request.image : ''
  draft.command = quoteCommand(Array.isArray(request.command) ? request.command.map((arg) => String(arg ?? '')) : [])
  draft.cpuCores = request.cpu_cores === undefined ? '' : String(request.cpu_cores)
  draft.ramGb = request.ram_bytes === undefined ? '' : String(request.ram_bytes / 1_000_000_000)
  draft.inputs = (Array.isArray(request.inputs) ? request.inputs : []).map((input) => ({
    bucket: String(input?.bucket ?? ''),
    key: String(input?.key ?? ''),
    path: String(input?.container_path ?? `/inputs/${input?.dest_key ?? ''}`),
    name: String(input?.dest_key ?? '').split('/').filter(Boolean).pop() ?? '',
  }))
  draft.outputs = (Array.isArray(request.outputs) ? request.outputs : []).map((output) => ({
    path: String(output?.container_path ?? ''),
    key: String(output?.dest_key ?? ''),
  }))
  return draft
}

export function pipelineSource(request: SubmitExecutionRequest): string {
  return JSON.stringify(request, null, 1)
}
