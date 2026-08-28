// Folders on this machine bound to a realm bucket. Module singleton, so the
// home card, the list and the detail view share one loaded set and one loading
// state; every call needs the local node up and the owner signed in.
import { computed, reactive, ref } from 'vue'
import { useDeviceQuery } from '@/composables/useDeviceQuery'
import {
  applyEntryAction,
  applyFolderAction,
  bindFolder,
  getFolder,
  listEntries,
  listFolderActions,
  listFolders,
  requireDevice,
  setFolderPaused,
  syncFolder,
  unbindFolder,
  type ActionExpectation,
  type ActionRecord,
  type BindFolderRequest,
  type DeviceClient,
  type EntryAction,
  type EntryPage,
  type EntryState,
  type SyncedFolder,
} from '@/lib/deviceApi'
import { needsYouCount } from '@/lib/syncStates'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { errorMessage } from '@/lib/utils'

const query = useDeviceQuery<SyncedFolder[]>(listFolders, [])
const folders = query.data
const listState = query.state
const listError = query.error
const busy = ref(false)
const actionErrors = reactive(new Map<string, string>())

const { deviceClient } = useDeviceStatus()

/** Throws when the node is not answering, so callers report one honest reason. */
function client(): DeviceClient {
  return requireDevice(deviceClient.value, 'its folders')
}

async function load(): Promise<void> {
  await query.run()
  if (listState.value !== 'ready') return
  for (const folder of folders.value) {
    if (!folder.last_error) actionErrors.delete(folder.folder_id)
  }
}

/** Paints the loaded set once; the views call it on mount. */
async function ensureLoaded(): Promise<void> {
  if (listState.value === 'ready' || listState.value === 'loading') return
  await load()
}

function replace(folder: SyncedFolder): SyncedFolder {
  const known = folders.value.some((entry) => entry.folder_id === folder.folder_id)
  folders.value = known
    ? folders.value.map((entry) => (entry.folder_id === folder.folder_id ? folder : entry))
    : [...folders.value, folder]
  return folder
}

async function folderAction<T>(folderId: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    actionErrors.set(folderId, errorMessage(error))
    throw error
  }
}

// Every mutation reports upward: the dialogs render the node's own refusal.
async function track<T>(work: () => Promise<T>): Promise<T> {
  busy.value = true
  try {
    return await work()
  } finally {
    busy.value = false
  }
}

function bind(request: BindFolderRequest): Promise<SyncedFolder> {
  return track(async () => replace(await bindFolder(request, client())))
}

async function unbind(folderId: string): Promise<void> {
  await track(() => unbindFolder(folderId, client()))
  folders.value = folders.value.filter((entry) => entry.folder_id !== folderId)
  actionErrors.delete(folderId)
}

function setPaused(folderId: string, paused: boolean): Promise<SyncedFolder> {
  return track(() => folderAction(folderId, async () => replace(await setFolderPaused(folderId, paused, client()))))
}

function sync(folderId: string): Promise<SyncedFolder> {
  return track(() =>
    folderAction(folderId, async () => {
      const folder = replace(await syncFolder(folderId, client()))
      if (!folder.last_error) actionErrors.delete(folderId)
      return folder
    }),
  )
}

async function refreshFolder(folderId: string): Promise<SyncedFolder> {
  const folder = replace(await getFolder(folderId, client()))
  if (!folder.last_error) actionErrors.delete(folderId)
  return folder
}

function entries(
  folderId: string,
  params: { state?: EntryState | ''; cursor?: string; limit?: number } = {},
): Promise<EntryPage> {
  return listEntries(folderId, params, client())
}

/** One decision on one entry; the expectation is what the owner was shown. */
function entryAction(
  folderId: string,
  path: string,
  action: EntryAction,
  expected: ActionExpectation,
) {
  return track(() => folderAction(folderId, () => applyEntryAction(folderId, path, { action, expected }, client())))
}

/** Replaces every pending file in the folder; `confirm` is the folder name. */
function folderReplace(folderId: string, confirm: string): Promise<SyncedFolder> {
  return track(() =>
    folderAction(folderId, async () =>
      replace(await applyFolderAction(folderId, { action: 'replace_local', scope: 'all_pending', confirm }, client())),
    ),
  )
}

function actionLog(folderId: string): Promise<ActionRecord[]> {
  return listFolderActions(folderId, client())
}

const available = computed(() => listState.value !== 'unsupported' && listState.value !== 'forbidden')

const needsYouTotal = computed(() =>
  folders.value.reduce((sum, folder) => sum + needsYouCount(folder.counters), 0),
)

export function useSyncedFolders() {
  return {
    folders,
    listState,
    listError,
    busy,
    actionErrors,
    available,
    needsYouTotal,
    load,
    ensureLoaded,
    bind,
    unbind,
    setPaused,
    sync,
    refreshFolder,
    entries,
    entryAction,
    folderReplace,
    actionLog,
  }
}
