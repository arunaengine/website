import { describe, expect, it } from 'vitest'
import { collectDropFiles, withRelativePath } from './dropEntries'

function fileEntry(name: string, readable = true): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve: (file: File) => void, reject: () => void) =>
      readable ? resolve(new File(['x'], name)) : reject(),
  } as unknown as FileSystemEntry
}

/** Answers one page per readEntries call, the way the browser reader does. */
function folderEntry(name: string, pages: FileSystemEntry[][]): FileSystemEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader() {
      let index = 0
      return { readEntries: (resolve: (entries: FileSystemEntry[]) => void) => resolve(pages[index++] ?? []) }
    },
  } as unknown as FileSystemEntry
}

function drop(entries: Array<FileSystemEntry | null>, files: File[] = []): DataTransfer {
  return {
    items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })),
    files,
  } as unknown as DataTransfer
}

function paths(files: File[]): string[] {
  return files.map((file) => file.webkitRelativePath)
}

describe('dropped entries', () => {
  it('walks a dropped folder into files that carry their path', async () => {
    const tree = folderEntry('reef', [
      [fileEntry('notes.txt'), folderEntry('raw', [[fileEntry('scan.tif')]])],
    ])

    const files = await collectDropFiles(drop([tree]))

    expect(paths(files)).toEqual(['reef/notes.txt', 'reef/raw/scan.tif'])
  })

  it('reads every page the directory reader hands out', async () => {
    const tree = folderEntry('reef', [[fileEntry('a.txt')], [fileEntry('b.txt')]])

    expect(paths(await collectDropFiles(drop([tree])))).toEqual(['reef/a.txt', 'reef/b.txt'])
  })

  it('skips an entry the browser refuses to read', async () => {
    const tree = folderEntry('reef', [[fileEntry('broken.txt', false), fileEntry('ok.txt')]])

    expect(paths(await collectDropFiles(drop([tree])))).toEqual(['reef/ok.txt'])
  })

  it('falls back to the plain file list without the entries API', async () => {
    const dropped = new File(['x'], 'loose.txt')

    const files = await collectDropFiles(drop([null], [dropped]))

    expect(files).toEqual([dropped])
  })

  it('answers nothing for a drop that carries no data', async () => {
    expect(await collectDropFiles(null)).toEqual([])
  })

  it('leaves a file that already knows its path alone', () => {
    const file = withRelativePath(new File(['x'], 'a.txt'), 'reef/a.txt')

    expect(withRelativePath(file, 'reef/a.txt').webkitRelativePath).toBe('reef/a.txt')
  })
})
