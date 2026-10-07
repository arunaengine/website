// Issues the open key requests of a bucket from the holder's own copy of the bucket key.
// The node admitted each request already; the key opens once per generation and is cleared.
import {
  ApiError,
  getBucketEncryption,
  listKeyRequests,
  submitKeyGrant,
  type AbeRecord,
  type ApiClientOptions,
  type KeyRequestFields,
} from '@/lib/api'
import { keyGenerations } from '@/lib/bucketEncryption'
import { NoUsableCopyError, openBucketKey, type UnlockVault } from './bucketUnlock'
import { issueGrant } from './keyWorker'

export interface IssueTarget {
  bucket: string
  /** Lowercase hex of the node that hosts the bucket. */
  nodeId: string
  client: ApiClientOptions
}

export interface IssueHolder {
  realmId: string
  userId: string
}

async function openRequests(target: IssueTarget): Promise<AbeRecord<KeyRequestFields>[]> {
  const records: AbeRecord<KeyRequestFields>[] = []
  let cursor: string | null = null
  do {
    const page = await listKeyRequests(target.bucket, cursor, target.client)
    records.push(...page.records)
    cursor = page.next_cursor
  } while (cursor)
  return records
}

/** The users who got a key, and whether no open request is left that this holder could issue. */
export interface IssueResult {
  users: Set<string>
  done: boolean
}

/** Issues the open requests of `target`; none for a bucket the user holds no key for. */
export async function issueBucket(
  target: IssueTarget,
  holder: IssueHolder,
  vault: UnlockVault,
  guard: () => void,
): Promise<IssueResult> {
  const issued = new Set<string>()
  let proposals: AbeRecord<KeyRequestFields>[]
  try {
    proposals = await openRequests(target)
  } catch (cause) {
    // Not a key holder, or no such bucket; rate limits and expired sign-ins are tried again later.
    if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) return { users: issued, done: true }
    throw cause
  }
  guard()
  if (!proposals.length) return { users: issued, done: true }
  const status = await getBucketEncryption(target.bucket, target.client)
  guard()
  const bucketId = status.bucket_id
  if (!bucketId) return { users: issued, done: false }
  let left = proposals.length
  const { list } = keyGenerations(status)
  for (const generation of new Set(proposals.map((proposal) => proposal.fields.parameters.generation))) {
    const publicKey = list.find((entry) => entry.generation === generation)?.public_key
    if (!publicKey) continue
    const context = { realmId: holder.realmId, nodeId: target.nodeId, bucketId, generation, userId: holder.userId }
    let key: Uint8Array<ArrayBuffer>
    try {
      key = await openBucketKey({ bucket: target.bucket, client: target.client, context, publicKey }, vault, guard)
    } catch (cause) {
      if (cause instanceof NoUsableCopyError) continue
      throw cause
    }
    try {
      for (const proposal of proposals) {
        if (proposal.fields.parameters.generation !== generation) continue
        const recipient = proposal.fields.recipient_user
        try {
          guard()
          const grant = await issueGrant(proposal, key, { bucket: target.bucket, recipient, holder: holder.userId })
          guard()
          await submitKeyGrant(target.bucket, proposal.fields.request_id, grant, target.client)
          issued.add(recipient)
          left -= 1
        } catch {
          // A request that went stale or cannot be issued here stays open for another holder.
          guard()
        }
      }
    } finally {
      key.fill(0)
    }
  }
  return { users: issued, done: left === 0 }
}
