// Builds the GA4GH task of a run from plain draft values. The run page keeps
// the form state and hands it here, so the notebook can build the same task
// without the page around it.
import {
  TES_EXECUTOR_TAG,
  TES_GROUP_TAG,
  TES_IDEMPOTENCY_TAG,
  placementTags,
  pruneTesTask,
  type TesExecutor,
  type TesInput,
  type TesOutput,
  type TesResources,
  type TesTask,
} from '@/lib/tes'
import { TES_NETWORK_TAG } from '@/lib/quickRuntimes'

/** Raw resource fields; number inputs emit numbers, so both are accepted. */
export interface RunResourceDraft {
  cpuCores: string | number
  ramGb: string | number
  diskGb: string | number
}

export interface RunExecutorDraft {
  image: string
  command: string[]
  env: { key: string; value: string }[]
  workdir: string
}

export interface RunTaskDraft {
  name: string
  description: string
  groupId: string
  /** Keys the idempotency tag, so a resend never starts a second run. */
  idempotencyKey: string
  executor: TesExecutor
  inputs: TesInput[]
  outputs: TesOutput[]
  resources: TesResources
  executorConstraint?: string
  /** Declared dependencies need the network open at start. */
  networkOpen?: boolean
  placementLabels?: Record<string, string>
}

function text(value: string | number): string {
  return String(value).trim()
}

/** Empty stays empty: the node decides what an unfilled value becomes. */
export function runResources(draft: RunResourceDraft): TesResources {
  const resources: TesResources = {}
  const cpu = Number(text(draft.cpuCores))
  if (text(draft.cpuCores) && !Number.isNaN(cpu)) resources.cpu_cores = cpu
  const ram = Number(text(draft.ramGb))
  if (text(draft.ramGb) && !Number.isNaN(ram)) resources.ram_gb = ram
  const disk = Number(text(draft.diskGb))
  if (text(draft.diskGb) && !Number.isNaN(disk)) resources.disk_gb = disk
  return resources
}

export function runExecutor(draft: RunExecutorDraft): TesExecutor {
  const env: Record<string, string> = {}
  for (const row of draft.env) if (row.key.trim()) env[row.key.trim()] = row.value
  const executor: TesExecutor = {
    image: draft.image.trim(),
    command: draft.command,
    workdir: draft.workdir,
  }
  if (Object.keys(env).length) executor.env = env
  return executor
}

export function buildRunTask(draft: RunTaskDraft): TesTask {
  return pruneTesTask({
    name: draft.name,
    description: draft.description,
    inputs: draft.inputs,
    outputs: draft.outputs,
    resources: draft.resources,
    executors: [draft.executor],
    tags: {
      [TES_GROUP_TAG]: draft.groupId,
      [TES_IDEMPOTENCY_TAG]: draft.idempotencyKey,
      ...(draft.executorConstraint?.trim() ? { [TES_EXECUTOR_TAG]: draft.executorConstraint.trim() } : {}),
      ...(draft.networkOpen ? { [TES_NETWORK_TAG]: 'open' } : {}),
      ...placementTags(draft.placementLabels ?? {}),
    },
  })
}
