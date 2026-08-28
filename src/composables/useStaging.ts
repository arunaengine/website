import { computed, ref } from 'vue'
import { useAruna } from './useAruna'
import { ApiError, type StageBlobResponse, type StagingStrategy } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export interface StagingSubmission {
  id: number
  strategy: StagingStrategy
  groupId: string
  connectorId: string
  connectorName: string
  sourcePath: string
  bucket: string
  key: string
  state: 'running' | 'done' | 'error'
  submittedAt: string // ISO
  result?: StageBlobResponse
  error?: string
}

// Module-singleton in-memory session log. Deliberately NOT persisted: POST
// /staging/ is synchronous and the backend keeps no queryable job registry, so
// after a reload there is no server truth to reconcile against.
const submissions = ref<StagingSubmission[]>([]) // newest first
let counter = 0

const { stageBlob } = useAruna()

// Mirrors aruna validate_relative_source_path: non-empty, not absolute, no
// backslashes, no '.'/'..' segments.
export function invalidSourcePath(path: string): boolean {
  const trimmed = path.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('/') || trimmed.includes('\\')) return true
  return trimmed.split('/').some((segment) => segment === '.' || segment === '..')
}

export function invalidSourcePrefix(path: string): boolean {
  const trimmed = path.trim()
  if (trimmed === '.' || trimmed === './') return false
  const withoutRoot = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed
  const normalized = withoutRoot.replace(/\/+$/, '')
  return !normalized || invalidSourcePath(normalized)
}

// ApiError status mapping verified against aruna api/src/routes/staging.rs.
export function stagingErrorMessage(err: unknown, strategy?: StagingStrategy): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return err.message
      case 403:
        return strategy === 'snapshot'
          ? 'Forbidden, you need write access to the target path and read access to the connector source. Snapshot staging is also rejected when the group is over its storage quota.'
          : 'Forbidden, you need write access to the target path and read access to the connector source.'
      case 404:
        return 'Bucket, connector or source not found, the bucket must belong to the selected group.'
      case 501:
        return 'This staging strategy is not implemented by the backend.'
      case 502:
        return 'The node could not reach the upstream source.'
      default:
        return err.message
    }
  }
  return errorMessage(err)
}

async function submitStaging(input: {
  strategy: 'snapshot' | 'reference'
  groupId: string
  connectorId: string
  connectorName: string
  sourcePath: string
  bucket: string
  key: string
}): Promise<StageBlobResponse> {
  const entry: StagingSubmission = {
    id: ++counter,
    strategy: input.strategy,
    groupId: input.groupId,
    connectorId: input.connectorId,
    connectorName: input.connectorName,
    sourcePath: input.sourcePath,
    bucket: input.bucket,
    key: input.key,
    state: 'running',
    submittedAt: new Date().toISOString(),
  }
  submissions.value = [entry, ...submissions.value]
  try {
    const result = await stageBlob({
      strategy: input.strategy,
      group_id: input.groupId,
      connector_id: input.connectorId,
      source_path: input.sourcePath,
      bucket: input.bucket,
      key: input.key,
    })
    entry.state = 'done'
    entry.result = result
    submissions.value = [...submissions.value]
    return result
  } catch (err) {
    entry.state = 'error'
    entry.error = stagingErrorMessage(err, input.strategy)
    submissions.value = [...submissions.value]
    throw err
  }
}

const runningCount = computed(() => submissions.value.filter((submission) => submission.state === 'running').length)

export function useStaging() {
  return { submissions, runningCount, submitStaging }
}
