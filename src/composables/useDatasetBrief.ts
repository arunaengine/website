// The name, description and license of a dataset, read with the dataset's own access rules.
// An unreadable or still materializing dataset gives no text, never a made-up one.
import { ref, watch, type Ref } from 'vue'
import { loadRoCrate } from '@/composables/aruna/crates'
import { briefOf, type DatasetBrief } from '@/lib/databases'

export function useDatasetBrief(datasetId: Ref<string | null>) {
  const brief = ref<DatasetBrief | null>(null)
  let runs = 0

  watch(
    datasetId,
    async (id) => {
      const run = ++runs
      brief.value = null
      if (!id) return
      try {
        const crate = await loadRoCrate(id)
        if (run === runs) brief.value = briefOf(crate)
      } catch {
        // The title from the list stays; the texts are left out.
      }
    },
    { immediate: true },
  )

  return brief
}
