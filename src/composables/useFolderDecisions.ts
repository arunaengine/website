// The decisions the owner took in their synced folders, newest first. Each
// folder keeps its own log, so one read asks every folder and says so when
// only some of them answered.
import { computed, ref, shallowRef } from 'vue'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { classify, folderName, type ActionRecord, type DeviceState } from '@/lib/deviceApi'
import { decisionText } from '@/lib/syncStates'

export interface Decision {
  folderId: string
  folder: string
  text: string
  atMs: number | null
}

export function useFolderDecisions() {
  const { folders, actionLog } = useSyncedFolders()
  const items = shallowRef<Decision[]>([])
  const state = ref<DeviceState>('idle')
  // Some folders did not answer, so the list may be shorter than the truth.
  const partial = ref(false)
  let generation = 0

  async function load(): Promise<void> {
    const mine = ++generation
    const asked = folders.value.map((folder) => ({ id: folder.folder_id, name: folderName(folder.root) }))
    if (state.value !== 'ready') state.value = 'loading'
    const answers = await Promise.allSettled(asked.map(async (folder) => actionLog(folder.id)))
    if (mine !== generation) return
    const found: Decision[] = []
    answers.forEach((answer, index) => {
      if (answer.status !== 'fulfilled') return
      for (const record of answer.value as ActionRecord[]) {
        const text = decisionText(record)
        if (text) found.push({ folderId: asked[index]!.id, folder: asked[index]!.name, text, atMs: record.at_ms })
      }
    })
    const failed = answers.filter((answer) => answer.status === 'rejected')
    items.value = found.sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0))
    partial.value = failed.length > 0 && failed.length < answers.length
    if (failed.length && failed.length === answers.length) {
      state.value = classify((failed[0] as PromiseRejectedResult).reason)
    } else {
      state.value = 'ready'
    }
  }

  const latest = computed(() => items.value[0] ?? null)

  return { items, latest, state, partial, load }
}
