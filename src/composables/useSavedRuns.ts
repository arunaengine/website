// The saved runs of this browser or desktop app, shared by the New run menu, the run page and
// the run details. Nothing leaves this computer unless the person exports a file.
import { ref } from 'vue'
import { exportRuns, importRuns, readSavedRuns, savedTask, withRun, writeSavedRuns, type SavedRun } from '@/lib/savedRuns'

const runs = ref<SavedRun[]>(readSavedRuns())

function store(next: SavedRun[]) {
  runs.value = next
  writeSavedRuns(next)
}

export function useSavedRuns() {
  return {
    runs,
    find: (id: string) => runs.value.find((run) => run.id === id),
    save: (run: SavedRun) => store(withRun(runs.value, { ...run, task: savedTask(run.task) })),
    remove: (id: string) => store(runs.value.filter((run) => run.id !== id)),
    importFile: async (file: File) => store(importRuns(await file.text(), runs.value)),
    exportFile() {
      const blob = new Blob([exportRuns(runs.value)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'my-runs.json'
      anchor.click()
      URL.revokeObjectURL(url)
    },
  }
}
