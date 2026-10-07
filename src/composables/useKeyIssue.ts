// Issues waiting key requests for buckets where the signed-in user holds the bucket key: when the
// vault opens, after a role grant, and for the bucket being browsed. Counts show for a few seconds.
import { ref, watch } from 'vue'
import { listGroupDataPaths } from '@/lib/api'
import { issueBucket, type IssueTarget } from '@/lib/vault/keyIssue'
import { apiBaseUrl, authToken, realmInfo, sessionEpoch, userInfo } from './aruna/state'
import { localNodeId, nodeApiBase } from './s3/endpoints'
import { useNotifications } from './useNotifications'
import { useUserVault } from './useUserVault'

export interface IssuedCount {
  people: number
  buckets: number
}

const NOTICE_MS = 6000

/** The last issuance with any keys, shown in the corner until it times out. */
const issued = ref<IssuedCount | null>(null)
/** Buckets with requests left open while the vault was closed, keyed by node and bucket. */
const waiting = new Map<string, { bucket: string; nodeId: string }>()
let watching = false
let noticeTimer: ReturnType<typeof setTimeout> | undefined

function targetOf(bucket: string, nodeId: string | null | undefined): IssueTarget | null {
  const node = nodeId || localNodeId()
  const baseUrl = node ? nodeApiBase(node) : null
  return node && baseUrl ? { bucket, nodeId: node, client: { baseUrl, token: authToken.value } } : null
}

async function pendingNotices(): Promise<IssueTarget[]> {
  const notifications = useNotifications()
  if (!notifications.listLoaded.value) await notifications.loadNotifications()
  return notifications.items.value
    .filter((entry) => entry.kind === 'bucket_key_pending' && !entry.read && entry.bucket)
    .map((entry) => targetOf(entry.bucket!, entry.node_id))
    .filter((target): target is IssueTarget => target !== null)
}

function show(count: IssuedCount) {
  issued.value = count
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    issued.value = null
  }, NOTICE_MS)
}

/** Issues every open request of `targets` while the vault stays open; null when it is closed. */
async function issueFor(targets: IssueTarget[]): Promise<IssuedCount | null> {
  const vault = useUserVault()
  const userId = userInfo.value?.user.user_id
  const realmId = userInfo.value?.realm.realm_id ?? realmInfo.value?.realm_id
  if (vault.state.value !== 'unlocked' || !userId || !realmId) return null
  const open = vault.whileUnlocked()
  const epoch = sessionEpoch.value
  const guard = () => {
    if (!open() || epoch !== sessionEpoch.value) throw new Error('The vault or the session changed.')
  }
  const people = new Set<string>()
  let buckets = 0
  const seen = new Set<string>()
  for (const target of targets) {
    const key = `${target.nodeId}\u0000${target.bucket}`
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const users = await issueBucket(target, { realmId, userId }, vault, guard)
      waiting.delete(key)
      if (users.size) buckets += 1
      users.forEach((user) => people.add(user))
    } catch {
      if (!open() || epoch !== sessionEpoch.value) return null
      // One bucket that fails stays waiting; the others still get their keys.
    }
  }
  const count = { people: people.size, buckets }
  if (count.people) show(count)
  return count
}

/** Every bucket with waiting requests this browser knows of, plus `extra`. */
async function issueWaiting(extra: IssueTarget[] = []): Promise<void> {
  const known = [...waiting.values()].map((entry) => targetOf(entry.bucket, entry.nodeId))
  let notices: IssueTarget[] = []
  try {
    notices = await pendingNotices()
  } catch {
    // Without the inbox the known buckets are still issued.
  }
  await issueFor([...extra, ...known.filter((target): target is IssueTarget => target !== null), ...notices])
}

/** After a role grant listed `requests`: issues the group's buckets now, or at the next vault opening. */
async function issueAfterGrant(groupId: string, requests: string[] | undefined): Promise<void> {
  if (!requests?.length) return
  const targets: IssueTarget[] = []
  const client = { baseUrl: apiBaseUrl.value, token: authToken.value }
  try {
    let token: string | undefined
    do {
      const page = await listGroupDataPaths(groupId, { continuationToken: token }, client)
      for (const entry of page.entries) {
        // `/{realm}/g/{group}/data/{node}/{bucket}`
        const [, , , , , node, bucket] = entry.permission_path.split('/')
        const target = node && bucket ? targetOf(bucket, node) : null
        if (target) targets.push(target)
      }
      token = page.continuation_token
    } while (token)
  } catch {
    return
  }
  if (useUserVault().state.value !== 'unlocked') {
    for (const target of targets) waiting.set(`${target.nodeId}\u0000${target.bucket}`, target)
    return
  }
  await issueFor(targets)
}

/** Starts issuing at every vault opening; safe to call from several places. */
function watchVault() {
  if (watching) return
  watching = true
  watch(useUserVault().state, (state, before) => {
    if (state === 'unlocked' && before !== 'unlocked') void issueWaiting()
  })
  watch(sessionEpoch, () => {
    waiting.clear()
    issued.value = null
  })
}

export function useKeyIssue() {
  return { issued, issueWaiting, issueAfterGrant, watchVault, targetOf }
}
