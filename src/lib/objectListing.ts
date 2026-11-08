// What the object list shows after its filters, and which list bar actions a
// selection allows. Pure, so the Data view and its tests share one answer.
import type { ArchiveEntry } from './api/archives'
import { formatCount } from './formatCount'
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

/** The last key of a listed page, folders included, in S3 key order. */
export function lastListedKey(listedKeys: string[]): string | undefined {
  return [...listedKeys].sort().at(-1)
}

/**
 * Deleted keys are listed per folder, so each page keeps those after the last
 * key of the page before, up to its own last key; the last page keeps the rest.
 */
export function deletedOnPage(
  deleted: DeletedObjectEntry[],
  after: string | undefined,
  through: string | undefined,
): DeletedObjectEntry[] {
  return deleted.filter(
    (entry) => (after === undefined || entry.key > after) && (through === undefined || entry.key <= through),
  )
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

export type RowAction = 'open' | 'details' | 'preview' | 'download' | 'rename' | 'move' | 'copy' | 'share' | 'share-link' | 'access' | 'delete' | 'purge'

export type SelectionAction = 'download' | 'move' | 'copy' | 'rename' | 'access' | 'delete'

/** Why a list bar action is unavailable for the ticked files and folders, or null. */
export function actionBlocker(action: SelectionAction, files: number, folders: number): string | null {
  const count = files + folders
  if (!count) return 'Tick files and folders in the list first.'
  if (action === 'rename' && count !== 1) return 'Tick exactly one file or folder to rename it.'
  if (action === 'download' && !files) return 'Folders cannot be downloaded here. Tick files.'
  return null
}

/** One ticked file downloads directly; more, or any folder, as one ZIP unless the bucket is locked. */
export function downloadKind(files: number, folders: number, locked: boolean): 'download' | 'zip' | null {
  if (files === 1 && !folders) return 'download'
  return locked || files + folders === 0 ? null : 'zip'
}

/** The ZIP request entries of ticked folders and files of one bucket. */
export function archiveEntries(bucket: string, keys: Iterable<string>, prefixes: Iterable<string>): ArchiveEntry[] {
  return [...[...prefixes].map((prefix) => ({ bucket, prefix })), ...[...keys].map((key) => ({ bucket, key }))]
}

/** "3 files, 1 folder"; a kind with none is left out. */
export function selectedText(files: number, folders: number): string {
  const part = (count: number, noun: string) => `${formatCount(count)}\u00a0${noun}${count === 1 ? '' : 's'}`
  return [files ? part(files, 'file') : '', folders ? part(folders, 'folder') : ''].filter(Boolean).join(', ')
}

export type SortKey = 'name' | 'size' | 'modified'
export interface ListSort {
  key: SortKey
  descending: boolean
}

type Sortable = { name: string; size?: number; lastModified?: Date }
const value = (entry: Sortable, key: SortKey) =>
  key === 'size' ? entry.size : key === 'modified' ? entry.lastModified?.getTime() : undefined

/** The rows of one page in the chosen order; a row without the value goes last either way. */
export function sortRows<R>(rows: R[], sort: ListSort, entry: (row: R) => Sortable): R[] {
  const sign = sort.descending ? -1 : 1
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') return sign * entry(a).name.localeCompare(entry(b).name, undefined, { numeric: true })
    const left = value(entry(a), sort.key)
    const right = value(entry(b), sort.key)
    if (left === undefined || right === undefined) return left === right ? 0 : left === undefined ? 1 : -1
    return sign * (left - right)
  })
}

/** A long name in two parts, so a cut keeps the end with the extension in view. */
export function splitName(name: string, keep = 12): [string, string] {
  return name.length > 24 ? [name.slice(0, -keep), name.slice(-keep)] : [name, '']
}

/** The listed rows of a page as "1 to 25", with "of N" once the last page names the total. */
export function pageRange(page: number, pageSize: number, listed: number, last: boolean): string {
  if (!listed) return ''
  const first = (page - 1) * pageSize + 1
  const end = first + listed - 1
  const shown = first === end ? formatCount(first) : `${formatCount(first)}-${formatCount(end)}`
  return last ? `${shown} of ${formatCount(end)}` : shown
}
