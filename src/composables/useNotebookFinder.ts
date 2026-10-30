// Finds the notebooks in every bucket of the active group, for the Notebooks tab and the picker.
// A bucket with more keys than the cap is marked as only partly searched, never as empty.
import { computed, ref, shallowRef, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useS3 } from '@/composables/useS3'
import { notebooksOf, type FoundNotebook } from '@/lib/notebook/finder'
import { errorMessage } from '@/lib/utils'

const MAX_KEYS = 5000
const PARALLEL = 4

export interface BucketScan {
  notebooks: FoundNotebook[]
  truncated: boolean
}

export function useNotebookFinder() {
  const s3 = useS3()
  const { sessionEpoch } = useAruna()
  const buckets = ref<string[]>([])
  const scans = shallowRef(new Map<string, BucketScan>())
  const failed = ref<string[]>([])
  const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const error = ref<string | null>(null)
  // A newer load, another group or another session drops the answers of the older one.
  let generation = 0

  async function load() {
    const run = ++generation
    const groupId = activeGroupId.value
    state.value = 'loading'
    error.value = null
    try {
      if (!groupId) throw new Error('Choose a group to find its notebooks.')
      await s3.ensureSession(groupId)
      const names = (await s3.listBuckets()).map((entry) => entry.name)
      if (run !== generation) return
      const found = new Map<string, BucketScan>()
      const bad: string[] = []
      const queue = [...names]
      const worker = async () => {
        for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
          try {
            const page = await s3.listObjectsRecursive(name, '', MAX_KEYS)
            found.set(name, { notebooks: notebooksOf(name, page.objects), truncated: page.truncated })
          } catch {
            bad.push(name)
          }
        }
      }
      await Promise.all(Array.from({ length: PARALLEL }, worker))
      if (run !== generation) return
      buckets.value = names
      scans.value = found
      failed.value = bad.sort()
      state.value = 'ready'
    } catch (cause) {
      if (run !== generation) return
      state.value = 'error'
      error.value = errorMessage(cause)
    }
  }

  watch([activeGroupId, sessionEpoch], () => {
    buckets.value = []
    scans.value = new Map()
    failed.value = []
    if (state.value !== 'idle') void load()
  })

  const notebooks = computed(() => [...scans.value.values()]
    .flatMap((scan) => scan.notebooks)
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0)))
  const partial = computed(() => [...scans.value].filter(([, scan]) => scan.truncated).map(([name]) => name))

  return { buckets, scans, failed, partial, state, error, notebooks, load }
}
