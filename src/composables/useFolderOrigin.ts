// Where the files of the open page came from. Each file's origin is asked of the bucket's node,
// four at a time and kept per version, and a run is named once. One origin shared by every file
// is said once above the list; files of different origins each name theirs. Pages of more than
// 50 files are not asked, so a large folder costs no requests.
import { computed, ref, watch, type Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useTes } from '@/composables/useTes'
import type { OriginResponse } from '@/lib/api'

export interface FileOrigin {
  /** Same for files of one origin: the run, or the kind for anything else. */
  key: string
  label: string
  to: RouteLocationRaw | null
  time: string
}

const MAX_FILES = 50
const origins = ref(new Map<string, OriginResponse | null>())
const runs = ref(new Map<string, { name: string; taskId: string | null } | null>())
// Reads under way, shared by every page that lists the same version.
const inFlight = new Map<string, Promise<void>>()
let epochSeen: number | null = null

type Listed = { key: string; etag?: string; lastModified?: Date }

// The listing names no version, so the answer must be of the version listed: its creation time
// is the listed modification time, to the second. An overwrite in between is left unknown.
function sameVersion(file: Listed, answer: OriginResponse | null): boolean {
  if (!answer || !file.lastModified) return true
  const created = Date.parse(answer.created_at)
  return Number.isNaN(created) || Math.floor(created / 1000) === Math.floor(file.lastModified.getTime() / 1000)
}

export function useFolderOrigin(bucket: Ref<string>, nodeId: Ref<string | null>, files: Ref<Listed[]>) {
  const { getFileOrigin, getRun, sessionEpoch } = useAruna()
  const { getTask } = useTes()
  // The same bytes uploaded again keep the ETag, so the time tells the versions apart.
  const cacheKey = (file: Listed) =>
    `${nodeId.value ?? ''}/${bucket.value}/${file.key}/${file.etag ?? ''}/${file.lastModified?.getTime() ?? ''}`

  // A run's name belongs to the account that read it: a later session drops the answer.
  async function readRun(runId: string, epoch: number) {
    if (runs.value.has(runId)) return
    runs.value = new Map(runs.value).set(runId, null)
    const run = await getRun(runId).catch(() => null)
    if (epoch !== sessionEpoch.value) return
    const taskId = run?.logical_job_id ?? null
    const task = taskId ? await getTask(taskId, 'BASIC').catch(() => null) : null
    if (epoch !== sessionEpoch.value) return
    runs.value = new Map(runs.value).set(runId, { name: task?.name || 'a run', taskId })
  }

  watch(
    [bucket, nodeId, files, sessionEpoch],
    async (_value, _old, onCleanup) => {
      const epoch = sessionEpoch.value
      if (epochSeen !== epoch) {
        epochSeen = epoch
        origins.value = new Map()
        runs.value = new Map()
        inFlight.clear()
      }
      // A new listing, a refresh or leaving the view stops this walk and its requests.
      const controller = new AbortController()
      const started = new Map<string, Promise<void>>()
      onCleanup(() => {
        controller.abort()
        for (const [key, flight] of started) if (inFlight.get(key) === flight) inFlight.delete(key)
      })
      const asked = { bucket: bucket.value, nodeId: nodeId.value }
      const keyed = files.value.length <= MAX_FILES ? files.value.map((file) => ({ file, key: cacheKey(file) })) : []
      const read = ({ file, key }: (typeof keyed)[number]) => {
        if (origins.value.has(key)) return Promise.resolve()
        let flight = inFlight.get(key)
        if (!flight) {
          flight = getFileOrigin(asked.bucket, { key: file.key }, controller.signal, asked.nodeId)
            .catch(() => null)
            .then((answer) => {
              if (controller.signal.aborted || epoch !== sessionEpoch.value || !sameVersion(file, answer)) return
              origins.value = new Map(origins.value).set(key, answer)
              if (answer?.origin?.kind === 'job') void readRun(answer.origin.run_id, epoch)
            })
            .finally(() => {
              if (inFlight.get(key) === flight) inFlight.delete(key)
            })
          inFlight.set(key, flight)
          started.set(key, flight)
        }
        return flight
      }
      for (let start = 0; start < keyed.length; start += 4) {
        await Promise.all(keyed.slice(start, start + 4).map(read))
        if (controller.signal.aborted) return
      }
    },
    { immediate: true },
  )

  function describe(answer: OriginResponse | null | undefined): FileOrigin | null {
    const origin = answer?.origin
    if (!answer || !origin) return null
    const time = answer.created_at
    if (answer.hop) return { key: `sync:${answer.hop.relationship_id}`, label: 'a sync', to: null, time }
    if (origin.kind === 'job') {
      const run = runs.value.get(origin.run_id)
      return { key: `job:${origin.run_id}`, label: run?.name ?? 'a run', to: run?.taskId ? { name: 'task', params: { taskId: run.taskId } } : null, time }
    }
    const LABELS = { upload: 'an upload', source: 'an import', copy: 'a copy', storage: 'a storage folder' } as const
    return { key: origin.kind, label: LABELS[origin.kind], to: null, time }
  }

  const byKey = computed(() => {
    const map = new Map<string, FileOrigin>()
    for (const file of files.value) {
      const described = describe(origins.value.get(cacheKey(file)))
      if (described) map.set(file.key, described)
    }
    return map
  })
  // Every file read and of one origin: said once, with the newest time.
  const shared = computed<FileOrigin | null>(() => {
    const all = [...byKey.value.values()]
    if (!files.value.length || all.length !== files.value.length || new Set(all.map((entry) => entry.key)).size !== 1) return null
    return all.reduce((newest, entry) => (entry.time > newest.time ? entry : newest))
  })
  const mixed = computed(() => byKey.value.size > 0 && !shared.value)

  return { byKey, shared, mixed }
}
