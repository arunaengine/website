import { computed, ref } from 'vue'
import { useAruna } from './useAruna'
import { ApiError, type StageBlobResponse, type StagingStrategy } from '@/lib/api'

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

// ApiError status mapping verified against aruna api/src/routes/staging.rs.
export function stagingErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return 'Invalid source path, use a relative path without "." or ".." segments.'
      case 403:
        return 'Forbidden, you need write access to the target path and read access to the connector source. A group over its storage quota is also rejected with 403.'
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
  return err instanceof Error ? err.message : String(err)
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
    entry.error = stagingErrorMessage(err)
    submissions.value = [...submissions.value]
    throw err
  }
}

const runningCount = computed(() => submissions.value.filter((submission) => submission.state === 'running').length)

export function useStaging() {
  return { submissions, runningCount, submitStaging }
}
