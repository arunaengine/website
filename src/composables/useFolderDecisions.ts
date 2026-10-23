// The decisions the owner took in their synced folders, newest first. Each
// folder keeps its own log, so one read asks every folder and says so when
// only some of them answered. A list belongs to the folders and the device it
// was read for: asking for another folder, or another device, empties it first.
import { computed, ref, shallowRef, watch } from 'vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { classify, folderName, type ActionRecord, type DeviceState } from '@/lib/deviceApi'
import { decisionLine, type DecisionOutcome } from '@/lib/syncStates'
import { errorMessage } from '@/lib/utils'

export interface Decision {
  folderId: string
  folder: string
  text: string
  atMs: number | null
  outcome: DecisionOutcome
}

export function useFolderDecisions() {
  const { folders, actionLog } = useSyncedFolders()
  const { deviceClient } = useDeviceStatus()
  const items = shallowRef<Decision[]>([])
  const state = ref<DeviceState>('idle')
  const error = ref<string | null>(null)
  // Some folders did not answer, so the list may be shorter than the truth.
  const partial = ref(false)
  let generation = 0
  // Which folders the list in hand was read for.
  let scope = ''
  // What a view last asked for, so a new device can be read for it again.
  let wanted: { only?: string } | null = null

  function clear(): void {
    items.value = []
    partial.value = false
    error.value = null
    state.value = 'idle'
    scope = ''
  }

  // A new device or session starts from nothing, and an answer in flight dies.
  // The view still waits for its list, so it is read again once a device is there.
  watch(deviceClient, (client) => {
    generation += 1
    clear()
    if (wanted && client) void load(wanted.only)
    else if (wanted) state.value = 'offline'
  })

  /** Reads every folder's log, or only the one named. */
  async function load(only?: string): Promise<void> {
    wanted = { only }
    const mine = ++generation
    const client = deviceClient.value
    const key = only ?? '*'
    if (key !== scope) clear()
    scope = key
    if (!client) {
      state.value = 'offline'
      return
    }
    const asked = folders.value
      .filter((folder) => !only || folder.folder_id === only)
      .map((folder) => ({ id: folder.folder_id, name: folderName(folder.root) }))
    if (state.value !== 'ready') state.value = 'loading'
    const answers = await Promise.allSettled(asked.map(async (folder) => actionLog(folder.id)))
    // Fenced by the request, the folder and the device it was made for.
    if (mine !== generation || deviceClient.value !== client) return
    const found: Decision[] = []
    answers.forEach((answer, index) => {
      if (answer.status !== 'fulfilled') return
      for (const record of answer.value as ActionRecord[]) {
        const line = decisionLine(record)
        if (line) {
          found.push({ folderId: asked[index]!.id, folder: asked[index]!.name, ...line, atMs: record.at_ms })
        }
      }
    })
    const failed = answers.filter((answer): answer is PromiseRejectedResult => answer.status === 'rejected')
    items.value = found.sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0))
    partial.value = failed.length > 0 && failed.length < answers.length
    if (failed.length && failed.length === answers.length) {
      state.value = classify(failed[0]!.reason)
      error.value = errorMessage(failed[0]!.reason)
    } else {
      state.value = 'ready'
      error.value = null
    }
  }

  const latest = computed(() => items.value[0] ?? null)

  return { items, latest, state, error, partial, load }
}
