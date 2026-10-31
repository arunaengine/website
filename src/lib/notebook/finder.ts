// Pure helpers of the notebook picker: which folders hold notebooks and how many.
import { isNotebookKey } from './document'

export interface FoundNotebook {
  bucket: string
  key: string
  size?: number
  lastModified?: Date
  /** The node holding the bucket; null or absent is the connected node. */
  nodeId?: string | null
}

/** The notebooks among the keys of one bucket, newest first. */
export function notebooksOf(bucket: string, objects: { key: string; size?: number; lastModified?: Date }[]): FoundNotebook[] {
  return objects
    .filter((entry) => isNotebookKey(entry.key))
    .map((entry) => ({ bucket, key: entry.key, size: entry.size, lastModified: entry.lastModified }))
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0))
}

/** How many notebooks lie anywhere below the folder `prefix` (empty for the whole bucket). */
export function countBelow(notebooks: readonly FoundNotebook[], prefix: string): number {
  return notebooks.filter((entry) => entry.key.startsWith(prefix)).length
}

/** The folder part of a key, with its trailing slash; empty at the bucket root. */
export function folderOf(key: string): string {
  const cut = key.lastIndexOf('/')
  return cut < 0 ? '' : key.slice(0, cut + 1)
}

/** Notebooks whose bucket, folder or name contains the text, ignoring case. */
export function matchNotebooks(notebooks: readonly FoundNotebook[], text: string): FoundNotebook[] {
  const needle = text.trim().toLowerCase()
  if (!needle) return []
  return notebooks.filter((entry) => `${entry.bucket}/${entry.key}`.toLowerCase().includes(needle))
}
