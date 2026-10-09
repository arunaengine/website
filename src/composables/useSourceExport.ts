// The source realm's side of an import into another realm, run from its popup page: start
// the export for the verified intent, wait for it, sign the grant, and push or hand over the
// metadata artifact when the destination asks for it.
import {
  ApiError,
  apiErrorMessage,
  createExport,
  createGrant,
  GRANT_HEADER,
  pushExport,
  transferHeader,
  type ApiClientOptions,
  type ExportGrant,
  type ImportIntent,
  type PushAnswer,
} from '@/lib/api'
import type { RealmDescriptor, Signed } from '@/lib/federation/descriptor'
import type { OpenerLink, OpenerRequest } from '@/lib/federation/handshake'
import type { PopupRequest } from '@/lib/federation/popup'
import { getJob, isTerminalJobState } from '@/lib/jobs'

const POLL_MS = 2_000
export const SESSION_CHANGED = 'The login here changed. Start again.'

export interface SourceExport {
  descriptor: Signed<RealmDescriptor>
  intent: Signed<ImportIntent>
  client: ApiClientOptions
}

export class ExportStop extends Error {
  name = 'ExportStop'
}

export function exportFailure(error: unknown, homeName: string): string {
  if (error instanceof ApiError && error.code === 'export_denied') return `${homeName} does not allow this export.`
  if (error instanceof ApiError && error.code === 'push_unreachable') return 'This realm cannot reach the other realm.'
  if (error instanceof ApiError && error.code === 'push_refused') return 'The other realm refused the copy.'
  if (error instanceof ApiError && error.code === 'grant_revoked') return 'This export was stopped.'
  if (error instanceof ExportStop) return error.message
  return apiErrorMessage(error)
}

/** Waits for the export job; `alive` ends the wait when the popup flow ended. */
export async function waitForJob(jobId: string, client: ApiClientOptions, alive: () => boolean, pollMs = POLL_MS) {
  for (;;) {
    if (!alive()) throw new ExportStop('The export was left.')
    const job = await getJob(jobId, client)
    if (!alive()) throw new ExportStop('The export was left.')
    if (isTerminalJobState(job.state)) {
      if (job.state !== 'succeeded') throw new ExportStop('The export did not finish.')
      return
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

/** Starts the export of the chosen dataset and files and returns its signed grant. */
export async function exportForIntent(
  source: SourceExport,
  documentId: string,
  files: string[],
  alive: () => boolean,
): Promise<{ jobId: string; grant: Signed<ExportGrant> }> {
  const { descriptor, intent, client } = source
  if (!alive()) throw new ExportStop('The export was left.')
  const submitted = await createExport({ descriptor, intent, document_id: documentId, files }, client)
  await waitForJob(submitted.job_id, client, alive)
  const grant = await createGrant(submitted.job_id, client)
  return { jobId: submitted.job_id, grant }
}

export function pushToDestination(source: SourceExport, jobId: string): Promise<PushAnswer> {
  return pushExport(jobId, { descriptor: source.descriptor, intent: source.intent }, source.client)
}

/**
 * The metadata only artifact, for a destination neither server of which reaches the other.
 * It is read with the grant, as the destination would read it, never with a bearer.
 */
export async function artifactBytes(grant: Signed<ExportGrant>): Promise<ArrayBuffer> {
  const response = await fetch(grant.payload.artifact_url, { headers: { [GRANT_HEADER]: transferHeader(grant) } })
  if (!response.ok) throw new ApiError(response.status, 'The export file is not available.')
  return response.arrayBuffer()
}

/**
 * After the grant the other realm may ask for a push, or for the metadata file itself. Each
 * request is served only while `alive` holds, checked before and after the work.
 */
export async function serveFollowUps(
  opener: Pick<OpenerLink, 'next' | 'reply' | 'refuse'>,
  source: SourceExport,
  granted: { jobId: string; grant: Signed<ExportGrant>; files: number; alive: () => boolean },
  homeName: string,
) {
  for (;;) {
    let next: OpenerRequest
    try {
      next = await opener.next()
    } catch {
      return
    }
    const asked = next.body as PopupRequest | undefined
    try {
      if (!granted.alive()) throw new ExportStop(SESSION_CHANGED)
      let answer: unknown
      if (asked?.kind === 'push') answer = await pushToDestination(source, granted.jobId)
      else if (asked?.kind === 'artifact' && granted.files === 0) answer = await artifactBytes(granted.grant)
      else {
        opener.refuse(next, 'This request is not supported.')
        continue
      }
      if (!granted.alive()) throw new ExportStop(SESSION_CHANGED)
      opener.reply(next, answer)
    } catch (error) {
      opener.refuse(next, exportFailure(error, homeName), error instanceof ApiError ? error.code : undefined)
    }
  }
}
