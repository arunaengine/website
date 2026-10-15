// What the object list shows after its filters, and which list bar actions a
// selection allows. Pure, so the Data view and its tests share one answer.
import type { DeletedObjectEntry } from './objectVersions'

export type ListingShow = 'all' | 'files' | 'folders'

export interface ListingFilters {
  show: ListingShow
  includeDeleted: boolean
}

export function filtersChanged(filters: ListingFilters): boolean {
  return filters.show !== 'all' || filters.includeDeleted
}

export function shownEntries<F, O>(folders: F[], objects: O[], show: ListingShow) {
  return {
    folders: show === 'files' ? [] : folders,
    objects: show === 'folders' ? [] : objects,
  }
}

/** Deleted keys of this folder that match the name filter and the shown kind. */
export function shownDeleted(
  deleted: DeletedObjectEntry[],
  nameStart: string,
  show: ListingShow,
): DeletedObjectEntry[] {
  if (show === 'folders') return []
  return deleted.filter((entry) => entry.name.startsWith(nameStart))
}

/**
 * Deleted keys are listed per folder, so a page keeps those inside its own key
 * range: from its first listed key when a page comes before, to its last when one follows.
 */
export function deletedOnPage(
  deleted: DeletedObjectEntry[],
  listedKeys: string[],
  hasPrevious: boolean,
  hasNext: boolean,
): DeletedObjectEntry[] {
  const keys = [...listedKeys].sort()
  const first = hasPrevious ? keys[0] : undefined
  const last = hasNext ? keys[keys.length - 1] : undefined
  return deleted.filter((entry) => (!first || entry.key >= first) && (!last || entry.key <= last))
}

export type FileRow<O> = { deleted: false; entry: O } | { deleted: true; entry: DeletedObjectEntry }

/** Live and deleted files in one list, ordered by key like the S3 listing. */
export function fileRows<O extends { key: string }>(objects: O[], deleted: DeletedObjectEntry[]): FileRow<O>[] {
  const rows: FileRow<O>[] = [
    ...objects.map((entry) => ({ deleted: false as const, entry })),
    ...deleted.map((entry) => ({ deleted: true as const, entry })),
  ]
  return rows.sort((a, b) => (a.entry.key < b.entry.key ? -1 : a.entry.key > b.entry.key ? 1 : 0))
}

export type RowAction = 'open' | 'details' | 'download' | 'rename' | 'move' | 'copy' | 'access' | 'delete'

export type SelectionAction = 'download' | 'move' | 'copy' | 'rename' | 'access' | 'delete'

/** Why a list bar action is unavailable for the ticked files and folders, or null. */
export function actionBlocker(action: SelectionAction, files: number, folders: number): string | null {
  const count = files + folders
  if (!count) return 'Tick files and folders in the list first.'
  if (action === 'rename' && count !== 1) return 'Tick exactly one file or folder to rename it.'
  if (action === 'download' && !files) return 'Folders cannot be downloaded here. Tick files.'
  return null
}
