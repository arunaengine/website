// What the object browser has ticked: object keys and folder prefixes in one
// shape, so a selection delete can carry both. The listing and the write check
// are injected, which keeps this state free of the Data manager's context.
import { computed, ref, type Ref } from 'vue'
import type { FolderEntry, ObjectEntry } from './useS3'
import type { StorageDeletionScope } from '@/lib/storageDeletion'

export interface SelectionSources {
  folders: Ref<FolderEntry[]>
  objects: Ref<ObjectEntry[]>
  canSelectObject: (key: string) => boolean
  canSelectFolder: (prefix: string) => boolean
}

export function useBrowserSelection(sources: SelectionSources) {
  const selectedObjectKeys = ref<Set<string>>(new Set())
  const selectedPrefixes = ref<Set<string>>(new Set())
  const selectedCount = computed(
    () => selectedObjectKeys.value.size + selectedPrefixes.value.size,
  )

  const selectableObjects = computed(() =>
    sources.objects.value.filter((object) => sources.canSelectObject(object.key)),
  )
  const selectableFolders = computed(() =>
    sources.folders.value.filter((folder) => sources.canSelectFolder(folder.prefix)),
  )
  const selectableListedCount = computed(
    () => selectableObjects.value.length + selectableFolders.value.length,
  )
  const allListedSelected = computed(
    () =>
      selectableListedCount.value > 0 &&
      selectableObjects.value.every((object) => selectedObjectKeys.value.has(object.key)) &&
      selectableFolders.value.every((folder) => selectedPrefixes.value.has(folder.prefix)),
  )
  const someListedSelected = computed(
    () =>
      selectableObjects.value.some((object) => selectedObjectKeys.value.has(object.key)) ||
      selectableFolders.value.some((folder) => selectedPrefixes.value.has(folder.prefix)),
  )

  function toggle(set: Ref<Set<string>>, id: string, selected: boolean) {
    const next = new Set(set.value)
    if (selected) next.add(id)
    else next.delete(id)
    set.value = next
  }

  function setObjectSelected(key: string, selected: boolean) {
    toggle(selectedObjectKeys, key, selected)
  }

  function setFolderSelected(prefix: string, selected: boolean) {
    toggle(selectedPrefixes, prefix, selected)
  }

  function setAllListedSelected(selected: boolean) {
    const keys = new Set(selectedObjectKeys.value)
    const prefixes = new Set(selectedPrefixes.value)
    for (const object of selectableObjects.value) {
      if (selected) keys.add(object.key)
      else keys.delete(object.key)
    }
    for (const folder of selectableFolders.value) {
      if (selected) prefixes.add(folder.prefix)
      else prefixes.delete(folder.prefix)
    }
    selectedObjectKeys.value = keys
    selectedPrefixes.value = prefixes
  }

  function clearSelection() {
    selectedObjectKeys.value = new Set()
    selectedPrefixes.value = new Set()
  }

  function keep(predicate: (id: string) => boolean) {
    selectedObjectKeys.value = new Set([...selectedObjectKeys.value].filter(predicate))
    selectedPrefixes.value = new Set([...selectedPrefixes.value].filter(predicate))
  }

  /** Drops what a finished deletion removed from the node. */
  function pruneSelection(scope: StorageDeletionScope) {
    if (scope.kind === 'bucket') {
      clearSelection()
      return
    }
    keep((id) => (scope.kind === 'file' ? id !== scope.key : !id.startsWith(scope.prefix)))
  }

  /** Only confirmed successes leave the selection; the rest stay for a retry. */
  function dropCommitted(committed: Iterable<string>) {
    const done = new Set(committed)
    keep((id) => !done.has(id))
  }

  return {
    selectedObjectKeys,
    selectedPrefixes,
    selectedCount,
    selectableListedCount,
    allListedSelected,
    someListedSelected,
    setObjectSelected,
    setFolderSelected,
    setAllListedSelected,
    clearSelection,
    pruneSelection,
    dropCommitted,
  }
}
