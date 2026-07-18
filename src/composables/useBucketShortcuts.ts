// Pinned and recently opened buckets for the Data manager sidebar. Stored in
// localStorage, scoped per connection AND account (the StoredS3Key pattern):
// entries recorded against one API base or user are never shown to another.
import { computed, ref } from 'vue'
import { useAruna } from './useAruna'
import { isWorkspaceBucket } from '@/lib/workspaces'

export interface BucketShortcut {
  bucket: string
  /** Owning node id; null = the connected node. */
  nodeId: string | null
}

interface ShortcutScope {
  pinned: BucketShortcut[]
  recent: BucketShortcut[]
}

const STORAGE_KEY = 'aruna.bucketShortcuts'
const RECENT_LIMIT = 5

type ShortcutStore = Record<string, ShortcutScope>

function sanitizeList(value: unknown): BucketShortcut[] {
  if (!Array.isArray(value)) return []
  const list: BucketShortcut[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const bucket = (entry as { bucket?: unknown }).bucket
    if (typeof bucket !== 'string' || !bucket) continue
    const nodeId = (entry as { nodeId?: unknown }).nodeId
    list.push({ bucket, nodeId: typeof nodeId === 'string' && nodeId ? nodeId : null })
  }
  return list
}

function loadStore(): ShortcutStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const store: ShortcutStore = {}
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      store[scope] = {
        pinned: sanitizeList((value as { pinned?: unknown }).pinned),
        recent: sanitizeList((value as { recent?: unknown }).recent).slice(0, RECENT_LIMIT),
      }
    }
    return store
  } catch {
    return {}
  }
}

const store = ref<ShortcutStore>(typeof window === 'undefined' ? {} : loadStore())

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.value))
  } catch {
    // The in-memory session keeps working when storage is unavailable.
  }
}

function sameShortcut(a: BucketShortcut, b: BucketShortcut): boolean {
  return a.bucket === b.bucket && (a.nodeId ?? null) === (b.nodeId ?? null)
}

export function useBucketShortcuts() {
  const { apiBaseUrl, currentUser } = useAruna()

  const scopeKey = computed(() => `${apiBaseUrl.value}|${currentUser.value?.id ?? 'anon'}`)

  const scope = computed<ShortcutScope>(
    () => store.value[scopeKey.value] ?? { pinned: [], recent: [] },
  )

  function update(mutate: (scope: ShortcutScope) => ShortcutScope) {
    store.value = { ...store.value, [scopeKey.value]: mutate(scope.value) }
    persist()
  }

  const pinned = computed(() => scope.value.pinned)
  // Pinned entries stay out of the recent list — one row per bucket.
  const recent = computed(() =>
    scope.value.recent.filter((entry) => !scope.value.pinned.some((pin) => sameShortcut(pin, entry))),
  )

  function isPinned(bucket: string, nodeId: string | null = null): boolean {
    return scope.value.pinned.some((pin) => sameShortcut(pin, { bucket, nodeId }))
  }

  function togglePin(bucket: string, nodeId: string | null = null) {
    const entry: BucketShortcut = { bucket, nodeId }
    update((current) => ({
      ...current,
      pinned: isPinned(bucket, nodeId)
        ? current.pinned.filter((pin) => !sameShortcut(pin, entry))
        : [...current.pinned, entry],
    }))
  }

  // Newest first, deduplicated, capped. Per-run ws- scratch buckets are
  // plumbing and never become shortcuts.
  function recordRecent(bucket: string, nodeId: string | null = null) {
    if (!bucket || isWorkspaceBucket(bucket)) return
    const entry: BucketShortcut = { bucket, nodeId }
    update((current) => ({
      ...current,
      recent: [entry, ...current.recent.filter((item) => !sameShortcut(item, entry))].slice(
        0,
        RECENT_LIMIT,
      ),
    }))
  }

  return { pinned, recent, isPinned, togglePin, recordRecent }
}
