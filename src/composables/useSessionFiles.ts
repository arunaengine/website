// A cached view of the file tree inside the running kernel, one directory per
// request. The cache belongs to one session job on one node; it is dropped
// when the job changes or ends, and marked stale when a cell finishes.
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { NotebookSessionStore } from '@/composables/useNotebookSession'
import { listScratch, sessionStarting, type ScratchEntry } from '@/lib/notebook/session'
import { errorMessage } from '@/lib/utils'

/** A folder opened again inside this window shows the cached listing. */
export const SCRATCH_FRESH_MS = 10_000

export interface ScratchDirectory {
  entries: ScratchEntry[] | null
  loading: boolean
  error: string | null
  /** The node answered 409 session_starting: the kernel is not ready yet. */
  starting: boolean
  fetchedAt: number
}

export type SessionFilesSource = Pick<NotebookSessionStore, 'jobId' | 'live' | 'ended' | 'client' | 'cellStates'>

export function parentPath(path: string): string | null {
  if (!path) return null
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut)
}

export function joinPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name
}

function blank(): ScratchDirectory {
  return { entries: null, loading: false, error: null, starting: false, fetchedAt: 0 }
}

export function useSessionFiles(session: SessionFilesSource) {
  const directories = shallowRef<Record<string, ScratchDirectory>>({})
  const expanded = ref<Set<string>>(new Set())
  let generation = 0
  let disposed = false
  let lastStates: Record<string, string> = {}

  function directory(path: string): ScratchDirectory | undefined {
    return directories.value[path]
  }

  function put(path: string, patch: Partial<ScratchDirectory>) {
    directories.value = { ...directories.value, [path]: { ...(directories.value[path] ?? blank()), ...patch } }
  }

  /** Answers true while the job, node and cache generation are the ones a request started under. */
  function current() {
    const request = generation
    const jobId = session.jobId.value
    const baseUrl = session.client.value.baseUrl
    return () =>
      !disposed && request === generation && jobId === session.jobId.value && baseUrl === session.client.value.baseUrl
  }

  function fresh(path: string): boolean {
    const known = directories.value[path]
    return Boolean(known?.entries) && Date.now() - (known?.fetchedAt ?? 0) < SCRATCH_FRESH_MS
  }

  /** Reads one directory, unless a fresh listing is cached and `force` is off. */
  async function load(path: string, force = false): Promise<void> {
    const jobId = session.jobId.value
    if (!jobId || session.ended.value) return
    if (!force && fresh(path)) return
    if (directories.value[path]?.loading) return
    const active = current()
    put(path, { loading: true })
    try {
      const listing = await listScratch(jobId, path, session.client.value)
      if (!active()) return
      put(path, { entries: listing.entries, loading: false, error: null, starting: false, fetchedAt: Date.now() })
    } catch (cause) {
      if (!active()) return
      if (sessionStarting(cause)) put(path, { loading: false, error: null, starting: true })
      else put(path, { loading: false, error: errorMessage(cause), starting: false })
    }
  }

  /** A directory is shown when every folder above it is open. */
  function visible(path: string): boolean {
    for (let parent = parentPath(path); parent; parent = parentPath(parent)) {
      if (!expanded.value.has(parent)) return false
    }
    return true
  }

  function loadVisible() {
    void load('')
    for (const path of expanded.value) if (visible(path)) void load(path)
  }

  /** Every cached listing is stale; the shown folders are read again. */
  function invalidate() {
    const next: Record<string, ScratchDirectory> = {}
    for (const [path, known] of Object.entries(directories.value)) next[path] = { ...known, fetchedAt: 0 }
    directories.value = next
    loadVisible()
  }

  /** Opens the folder and the folders above it, so a staged file is in view. */
  function open(path: string) {
    const next = new Set(expanded.value)
    for (let folder: string | null = path; folder; folder = parentPath(folder)) next.add(folder)
    expanded.value = next
  }

  function toggle(path: string) {
    if (expanded.value.has(path)) {
      const next = new Set(expanded.value)
      next.delete(path)
      expanded.value = next
      return
    }
    open(path)
    void load(path)
  }

  /** The manual refresh, and the refresh after staging into `path`. */
  function refresh(path?: string) {
    if (path !== undefined) open(path)
    invalidate()
  }

  function clear() {
    generation += 1
    directories.value = {}
    expanded.value = new Set()
    lastStates = {}
  }

  watch(session.jobId, clear, { flush: 'sync' })
  watch(session.ended, (done) => { if (done) clear() }, { flush: 'sync' })
  // A starting kernel answered 409; the first live state reads the tree.
  watch(session.live, (live) => { if (live) loadVisible() })

  // A cell that finished may have written files anywhere in the workdir.
  watch(session.cellStates, (cells) => {
    let finished = false
    const next: Record<string, string> = {}
    for (const [id, cell] of Object.entries(cells)) {
      next[id] = cell.state
      if ((cell.state === 'done' || cell.state === 'error') && lastStates[id] !== cell.state) finished = true
    }
    lastStates = next
    if (finished) invalidate()
  })

  onScopeDispose(() => {
    disposed = true
  })

  return { directories, expanded, directory, load, toggle, open, refresh, invalidate, clear }
}

export type SessionFilesStore = ReturnType<typeof useSessionFiles>
