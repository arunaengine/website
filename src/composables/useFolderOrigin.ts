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
let epochSeen: number | null = null

type Listed = { key: string; etag?: string }

export function useFolderOrigin(bucket: Ref<string>, nodeId: Ref<string | null>, files: Ref<Listed[]>) {
  const { getFileOrigin, getRun, sessionEpoch } = useAruna()
  const { getTask } = useTes()
  const cacheKey = (file: Listed) => `${nodeId.value ?? ''}/${bucket.value}/${file.key}/${file.etag ?? ''}`

  async function readRun(runId: string) {
    if (runs.value.has(runId)) return
    runs.value = new Map(runs.value).set(runId, null)
    const run = await getRun(runId).catch(() => null)
    const taskId = run?.logical_job_id ?? null
    const task = taskId ? await getTask(taskId, 'BASIC').catch(() => null) : null
    runs.value = new Map(runs.value).set(runId, { name: task?.name || 'a run', taskId })
  }

  let round = 0
  watch(
    [bucket, nodeId, files, sessionEpoch],
    async () => {
      const mine = ++round
      if (epochSeen !== sessionEpoch.value) {
        epochSeen = sessionEpoch.value
        origins.value = new Map()
        runs.value = new Map()
      }
      const missing = files.value.length <= MAX_FILES ? files.value.filter((file) => !origins.value.has(cacheKey(file))) : []
      const asked = { bucket: bucket.value, nodeId: nodeId.value }
      for (let start = 0; start < missing.length; start += 4) {
        const batch = missing.slice(start, start + 4)
        const answers = await Promise.all(
          batch.map((file) => getFileOrigin(asked.bucket, { key: file.key }, undefined, asked.nodeId).catch(() => null)),
        )
        if (mine !== round) return
        const next = new Map(origins.value)
        batch.forEach((file, index) => next.set(cacheKey(file), answers[index]))
        origins.value = next
        for (const answer of answers) if (answer?.origin?.kind === 'job') void readRun(answer.origin.run_id)
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
