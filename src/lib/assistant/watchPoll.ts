// Reads one watched thing and hands the registry its verdict. The job and sync
// surfaces are imported lazily, so the shell never pulls them in for a chat
// that watches nothing.
import type { ApiClientOptions } from '@/lib/api'
import { jobOutcome, syncOutcome, type AssistantWatch, type WatchPoll } from './watchers'

export function watchPoller(client: () => ApiClientOptions) {
  return async function poll(watch: AssistantWatch): Promise<WatchPoll> {
    if (watch.kind === 'job') {
      const { getJob } = await import('@/lib/jobs')
      return jobOutcome(watch, (await getJob(watch.target, client())).state)
    }
    const { getSyncRelationship } = await import('@/composables/aruna/sync')
    const detail = await getSyncRelationship(watch.target)
    return syncOutcome(watch, {
      state: detail.relationship.state,
      pendingJobs: detail.pending_jobs,
      lastSyncedAt: detail.last_synced_at ?? detail.relationship.status.last_synced_at,
      lastError: detail.last_error ?? detail.relationship.status.last_error,
    })
  }
}
