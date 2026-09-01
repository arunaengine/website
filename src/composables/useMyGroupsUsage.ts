// One GET /access/groups/{id}/usage per membership, shared by the dashboard's
// personal tiles and the per-group cards so the requests are made once.
// Physical stored bytes have no group dimension (dedup), so they are never
// carried here and never summed.
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { assessQuota, quotaCountedBytes, referencedBytes, type QuotaState } from '@/lib/quota'
import { errorMessage } from '@/lib/utils'
import type { GroupQuotaStatus, UsageResponse } from '@/lib/api'

const { myGroups, getGroupUsage } = useAruna()

export interface GroupUsageEntry {
  groupId: string
  name: string
  status: 'loading' | 'ready' | 'error'
  error?: string
  quota?: GroupQuotaStatus | null
  usedBytes?: number
  referencedBytes?: number
  datasetCount?: number | null
  profileCount?: number | null
  processRunCount?: number | null
  buckets?: number
  objects?: number
}

export interface MyGroupsAggregate {
  groups: number
  /** Null means "Unknown": a group's usage failed or its count is unreported. */
  datasets: number | null
  buckets: number | null
  objects: number | null
  usedBytes: number | null
  worstState: QuotaState | null
  /** Names of the groups whose usage could not be read. */
  failed: string[]
  pending: boolean
}

// Severity ordering so the groups that need attention float to the top.
export const QUOTA_SEVERITY: Record<QuotaState, number> = {
  'over-ceiling': 0,
  'over-quota': 1,
  warning: 2,
  ok: 3,
  unlimited: 4,
  'no-policy': 5,
}

export function entryState(entry: GroupUsageEntry): QuotaState {
  return assessQuota(entry.quota, entry.usedBytes ?? 0).state
}

// The group's realm-wide figure when the backend serves it, matching the
// counter quotaCountedBytes() enforces against.
function realmScoped(usage: UsageResponse, key: 'buckets' | 'objects'): number {
  return usage.realm?.[key] ?? usage[key]
}

const entries = ref<GroupUsageEntry[]>([])
const loading = ref(false)

// Guard stale loads (same pattern as AdminView's userSearchSeq).
let loadSeq = 0
let inflight: Promise<void> | null = null
let loadedKey: string | null = null

function membershipKey(): string {
  return myGroups.value.map((group) => group.id).join(',')
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next)
  })
  await Promise.all(workers)
}

async function fetchEntry(entry: GroupUsageEntry, seq: number): Promise<void> {
  try {
    const usage = await getGroupUsage(entry.groupId)
    if (seq !== loadSeq) return
    entry.usedBytes = quotaCountedBytes(usage)
    entry.referencedBytes = referencedBytes(usage)
    entry.datasetCount = usage.dataset_count ?? null
    entry.profileCount = usage.profile_count ?? null
    entry.processRunCount = usage.process_run_count ?? null
    entry.buckets = realmScoped(usage, 'buckets')
    entry.objects = realmScoped(usage, 'objects')
    entry.quota = usage.quota ?? null
    entry.error = undefined
    entry.status = 'ready'
  } catch (err) {
    if (seq !== loadSeq) return
    entry.status = 'error'
    entry.error = errorMessage(err)
  }
  entries.value = [...entries.value]
}

async function run(): Promise<void> {
  const seq = ++loadSeq
  const key = membershipKey()
  const groups = [...myGroups.value].sort((a, b) => a.name.localeCompare(b.name))
  // Preserve already-loaded entries across a reload so a dashboard refresh
  // updates the figures in place instead of flashing everything back to a
  // skeleton (reloads fire on mount, on interval and on manual refresh).
  const previous = new Map(entries.value.map((entry) => [entry.groupId, entry]))
  entries.value = groups.map((group): GroupUsageEntry => {
    const prior = previous.get(group.id)
    if (prior && prior.status === 'ready') return { ...prior, name: group.name }
    return { groupId: group.id, name: group.name, status: 'loading' }
  })
  // Every membership is represented immediately; usage loads incrementally
  // with only three requests in flight at once.
  await mapLimit(entries.value, 3, (entry) => fetchEntry(entry, seq))
  if (seq === loadSeq) loadedKey = key
}

/** Loads the memberships that are not loaded yet; concurrent callers share one round. */
export function loadMyGroupsUsage(force = false): Promise<void> {
  if (inflight) return inflight
  if (!force && membershipKey() === loadedKey) return Promise.resolve()
  loading.value = true
  const started = run().finally(() => {
    if (inflight === started) {
      inflight = null
      loading.value = false
    }
  })
  inflight = started
  return started
}

function retry(entry: GroupUsageEntry): void {
  entry.status = 'loading'
  entry.error = undefined
  entries.value = [...entries.value]
  void fetchEntry(entry, loadSeq)
}

/**
 * Aggregate over the caller's memberships. Any group that failed makes every
 * total unknown rather than silently low, and drops the quota badge because the
 * worst state may be hiding in the group that did not answer.
 */
export function aggregateGroupUsage(list: readonly GroupUsageEntry[]): MyGroupsAggregate {
  const ready = list.filter((entry) => entry.status === 'ready')
  const failed = list.filter((entry) => entry.status === 'error').map((entry) => entry.name)
  const sum = (pick: (entry: GroupUsageEntry) => number | null | undefined): number | null => {
    if (failed.length) return null
    let total = 0
    for (const entry of ready) {
      const value = pick(entry)
      if (value == null) return null
      total += value
    }
    return total
  }
  const worst = ready
    .map(entryState)
    .sort((a, b) => QUOTA_SEVERITY[a] - QUOTA_SEVERITY[b])[0]
  return {
    groups: list.length,
    datasets: sum((entry) => entry.datasetCount),
    buckets: sum((entry) => entry.buckets),
    objects: sum((entry) => entry.objects),
    usedBytes: sum((entry) => entry.usedBytes),
    worstState: failed.length || !worst ? null : worst,
    failed,
    pending: list.some((entry) => entry.status === 'loading'),
  }
}

const aggregate = computed(() => aggregateGroupUsage(entries.value))

export function useMyGroupsUsage() {
  return {
    entries,
    aggregate,
    loading,
    membershipKey,
    load: loadMyGroupsUsage,
    refresh: () => loadMyGroupsUsage(true),
    retry,
  }
}
