// The File System Access API (Chromium): one picker for files and one for a
// whole folder. Both hand back handles, so a picked folder is walked into the
// same relative paths <input webkitdirectory> produces.
import { withRelativePath } from './dropEntries'

interface PickedFile {
  kind: 'file'
  name: string
  getFile(): Promise<File>
}

interface PickedDirectory {
  kind: 'directory'
  name: string
  values(): AsyncIterable<PickedFile | PickedDirectory>
}

interface PickerScope {
  showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<PickedFile[]>
  showDirectoryPicker?: () => Promise<PickedDirectory>
}

function scope(): PickerScope {
  return globalThis as PickerScope
}

/** True where both pickers exist, so one Browse menu can offer files or a folder. */
export function pickersSupported(): boolean {
  const global = scope()
  return typeof global.showOpenFilePicker === 'function' && typeof global.showDirectoryPicker === 'function'
}

export async function pickFiles(): Promise<File[]> {
  const open = scope().showOpenFilePicker
  if (!open) return []
  const handles = await open({ multiple: true })
  return Promise.all(handles.map((handle) => handle.getFile()))
}

export async function pickFolder(): Promise<File[]> {
  const open = scope().showDirectoryPicker
  if (!open) return []
  const directory = await open()
  const out: File[] = []
  await walk(directory, directory.name, out)
  return out
}

async function walk(directory: PickedDirectory, prefix: string, out: File[]) {
  for await (const entry of directory.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === 'file') out.push(withRelativePath(await entry.getFile(), path))
    else await walk(entry, path, out)
  }
}
