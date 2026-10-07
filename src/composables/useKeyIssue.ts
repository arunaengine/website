// Issues waiting key requests for buckets where the signed-in user holds the bucket key: when the
// vault opens, after a role grant, and for the bucket being browsed. Counts show for a few seconds.
import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { listGroupDataPaths } from '@/lib/api'
import { assistantChatScopeKey } from '@/lib/assistant/chatHistory'
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
/** Buckets with requests left open, kept per account across reloads: public names only. */
const WAITING_PREFIX = 'aruna.keyIssue.waiting:'
interface Waiting {
  bucket: string
  nodeId: string
}
let watching = false
/** One issuance at a time, so a later one finds the earlier one's requests already issued. */
let queue: Promise<unknown> = Promise.resolve()
let noticeTimer: ReturnType<typeof setTimeout> | undefined

function targetOf(bucket: string, nodeId: string | null | undefined): IssueTarget | null {
  const node = nodeId || localNodeId()
  const baseUrl = node ? nodeApiBase(node) : null
  return node && baseUrl ? { bucket, nodeId: node, client: { baseUrl, token: authToken.value } } : null
}

/** The API base, realm and user that waiting buckets are kept under; empty while signed out. */
function waitingScope(): string {
  const userId = userInfo.value?.user.user_id
  const realmId = userInfo.value?.realm.realm_id ?? realmInfo.value?.realm_id
  if (!userId || !realmId || !apiBaseUrl.value) return ''
  return assistantChatScopeKey({ apiBaseUrl: apiBaseUrl.value, realmId, userId })
}

function loadWaiting(scope: string): Waiting[] {
  try {
    const list: unknown = JSON.parse(globalThis.localStorage?.getItem(WAITING_PREFIX + scope) ?? '[]')
    return Array.isArray(list)
      ? list.filter((entry): entry is Waiting => typeof entry?.bucket === 'string' && typeof entry?.nodeId === 'string')
      : []
  } catch {
    return []
  }
}

/** Keeps `target` waiting under `scope`, or forgets it once nothing is left to issue. */
function markWaiting(scope: string, target: IssueTarget, open: boolean) {
  if (!scope) return
  const list = loadWaiting(scope).filter((entry) => entry.bucket !== target.bucket || entry.nodeId !== target.nodeId)
  if (open) list.push({ bucket: target.bucket, nodeId: target.nodeId })
  try {
    if (list.length) globalThis.localStorage?.setItem(WAITING_PREFIX + scope, JSON.stringify(list))
    else globalThis.localStorage?.removeItem(WAITING_PREFIX + scope)
  } catch {
    // Without storage the buckets wait until the page closes.
  }
}

const isPending = (entry: { kind: string; bucket?: string | null }) => entry.kind === 'bucket_key_pending' && !!entry.bucket

/** Buckets of every pending key notice; reading a notice does not mean its keys were issued. */
async function pendingNotices(): Promise<IssueTarget[]> {
  const notifications = useNotifications()
  if (!notifications.listLoaded.value) await notifications.loadNotifications()
  let cursor: string | null = null
  while (notifications.nextCursor.value && notifications.nextCursor.value !== cursor) {
    cursor = notifications.nextCursor.value
    await notifications.loadMore()
  }
  return notifications.items.value
    .filter(isPending)
    .map((entry) => targetOf(entry.bucket!, entry.node_id))
    .filter((target): target is IssueTarget => target !== null)
}

/** Marks the notices about `target` read once nothing is left to issue there. */
function settleNotices(target: IssueTarget) {
  const notifications = useNotifications()
  const ids = notifications.items.value
    .filter((entry) => isPending(entry) && !entry.read && entry.bucket === target.bucket)
    .filter((entry) => (entry.node_id || localNodeId()) === target.nodeId)
    .map((entry) => entry.id)
  if (ids.length) void notifications.markRead(ids)
}

function show(count: IssuedCount) {
  issued.value = count
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    issued.value = null
  }, NOTICE_MS)
}

/** Issues every open request of `targets` while the vault stays open; null when it is closed. */
function issueFor(targets: IssueTarget[], epoch = sessionEpoch.value, scope = waitingScope()): Promise<IssuedCount | null> {
  const next = queue.then(() => issueNow(targets, epoch, scope))
  queue = next.catch(() => null)
  return next
}

/** Work queued under another session or account ends without a request. */
async function issueNow(targets: IssueTarget[], epoch: number, scope: string): Promise<IssuedCount | null> {
  const vault = useUserVault()
  const userId = userInfo.value?.user.user_id
  const realmId = userInfo.value?.realm.realm_id ?? realmInfo.value?.realm_id
  if (epoch !== sessionEpoch.value || scope !== waitingScope()) return null
  if (vault.state.value !== 'unlocked' || !userId || !realmId) return null
  const open = vault.whileUnlocked()
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
      const { users, done } = await issueBucket(target, { realmId, userId }, vault, guard)
      guard()
      markWaiting(scope, target, !done)
      if (done) settleNotices(target)
      if (users.size) buckets += 1
      users.forEach((user) => people.add(user))
    } catch {
      if (!open() || epoch !== sessionEpoch.value) return null
      // One bucket that fails stays waiting; the others still get their keys.
      markWaiting(scope, target, true)
    }
  }
  const count = { people: people.size, buckets }
  if (count.people) show(count)
  return count
}

/** Every bucket with waiting requests this browser knows of, plus `extra`. */
async function issueWaiting(extra: IssueTarget[] = []): Promise<void> {
  const epoch = sessionEpoch.value
  const scope = waitingScope()
  const known = loadWaiting(scope).map((entry) => targetOf(entry.bucket, entry.nodeId))
  let notices: IssueTarget[] = []
  try {
    notices = await pendingNotices()
  } catch {
    // Without the inbox the known buckets are still issued.
  }
  const found = known.filter((target): target is IssueTarget => target !== null)
  await issueFor([...extra, ...found, ...notices], epoch, scope)
}

/** After a role grant listed `requests`: issues the group's buckets now or at the next vault opening. */
async function issueAfterGrant(groupId: string, requests: string[] | undefined): Promise<void> {
  if (!requests?.length) return
  const epoch = sessionEpoch.value
  const scope = waitingScope()
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
  if (epoch !== sessionEpoch.value) return
  // Holders get no notice for these, so they wait here until issued, across reloads too.
  for (const target of targets) markWaiting(scope, target, true)
  if (useUserVault().state.value === 'unlocked') await issueFor(targets, epoch, scope)
}

/** Starts issuing at every vault opening, and now if it is open; ends with the calling scope. */
function watchVault() {
  if (watching) return
  watching = true
  if (getCurrentScope()) {
    onScopeDispose(() => {
      watching = false
    })
  }
  watch(useUserVault().state, (state, before) => {
    if (state === 'unlocked' && before !== 'unlocked') void issueWaiting()
  }, { immediate: true })
  watch(sessionEpoch, () => {
    issued.value = null
  })
}

export function useKeyIssue() {
  return { issued, issueWaiting, issueAfterGrant, watchVault, targetOf }
}
