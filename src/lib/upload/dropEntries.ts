// What a drop actually carries. DataTransfer.files lists dropped files only: a
// dropped folder is invisible there, so the entries API is walked instead when
// the browser offers it. Every collected file keeps the folder-relative path
// an <input webkitdirectory> would have produced, which is what the basket
// reads to rebuild the structure under the target prefix.

/** Gives a picked file the folder-relative path the basket reads. */
export function withRelativePath(file: File, path: string): File {
  if (!path || file.webkitRelativePath === path) return file
  return Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true })
}

function fileOf(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    )
  })
}

function readPage(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    reader.readEntries(
      (entries) => resolve(entries),
      () => resolve([]),
    )
  })
}

async function walk(entry: FileSystemEntry, prefix: string, out: File[]) {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await fileOf(entry as FileSystemFileEntry)
    if (file) out.push(withRelativePath(file, path))
    return
  }
  if (!entry.isDirectory) return
  // readEntries answers one page at a time and is done when a page is empty.
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  for (;;) {
    const page = await readPage(reader)
    if (!page.length) return
    for (const child of page) await walk(child, path, out)
  }
}

/**
 * Files a drop carries, folders included. The item list is read synchronously
 * because the browser empties it once the drop handler returns.
 */
export async function collectDropFiles(transfer: DataTransfer | null | undefined): Promise<File[]> {
  if (!transfer) return []
  const items = Array.from(transfer.items ?? [])
  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => Boolean(entry))
  if (!entries.length) return Array.from(transfer.files ?? [])
  const out: File[] = []
  for (const entry of entries) await walk(entry, '', out)
  return out
}
