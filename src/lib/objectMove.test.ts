import { describe, expect, it, vi } from 'vitest'
import { parseTarget, runTransfer, targetProblem, type TransferStore } from './objectMove'

const missing = Object.assign(new Error('Not Found'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })

function store(listed: string[] = [], truncated = false, markers: string[] = []) {
  const calls: string[] = []
  // The current ETag per key; a test changes one to overwrite the file.
  const revisions = new Map<string, string>()
  const fake: TransferStore = {
    listObjectsRecursive: vi.fn(async () => ({ objects: listed.map((key) => ({ key })), truncated })),
    copyObject: vi.fn(async (source, bucket, key) => {
      calls.push(`copy ${source.bucket}/${source.key} -> ${bucket}/${key}`)
    }),
    deleteObject: vi.fn(async (bucket, key) => {
      calls.push(`delete ${bucket}/${key}`)
    }),
    headObject: vi.fn(async (_bucket: string, key: string) => {
      if (key.endsWith('/') && !markers.includes(key)) throw missing
      return { etag: revisions.get(key) ?? 'v1' }
    }),
  }
  return { fake, calls, revisions }
}

describe('transfer target', () => {
  it('reads a bucket and a folder prefix', () => {
    expect(parseTarget('reef/raw/run-1/')).toEqual({ bucket: 'reef', prefix: 'raw/run-1/' })
    expect(parseTarget(' /reef ')).toEqual({ bucket: 'reef', prefix: '' })
    expect(parseTarget('')).toBeNull()
  })

  it('refuses a folder into itself and a move into the same folder', () => {
    const folder = [{ key: 'raw/genomes/', folder: true }]
    const file = [{ key: 'raw/reads.fastq', folder: false }]
    expect(targetProblem('copy', 'reef', folder, { bucket: 'reef', prefix: 'raw/genomes/sub/' })).not.toBeNull()
    expect(targetProblem('copy', 'reef', folder, { bucket: 'other', prefix: 'raw/genomes/sub/' })).toBeNull()
    expect(targetProblem('move', 'reef', file, { bucket: 'reef', prefix: 'raw/' })).not.toBeNull()
    expect(targetProblem('copy', 'reef', file, { bucket: 'reef', prefix: 'raw/' })).toBeNull()
  })

  it('checks a new name', () => {
    const file = [{ key: 'raw/reads.fastq', folder: false }]
    expect(targetProblem('rename', 'reef', file, { bucket: 'reef', prefix: 'raw/' }, 'reads.fastq')).not.toBeNull()
    expect(targetProblem('rename', 'reef', file, { bucket: 'reef', prefix: 'raw/' }, 'a/b')).not.toBeNull()
    expect(targetProblem('rename', 'reef', file, { bucket: 'reef', prefix: 'raw/' }, 'r2.fastq')).toBeNull()
  })
})

describe('transfer run', () => {
  it('copies every file before a move deletes the sources', async () => {
    const { fake, calls } = store(['raw/genomes/a.fa', 'raw/genomes/b/c.fa'])
    await runTransfer(
      fake,
      'move',
      'reef',
      [
        { key: 'raw/genomes/', folder: true },
        { key: 'raw/reads.fastq', folder: false },
      ],
      { bucket: 'archive', prefix: 'old/' },
      null,
    )
    expect(calls).toEqual([
      'copy reef/raw/genomes/a.fa -> archive/old/genomes/a.fa',
      'copy reef/raw/genomes/b/c.fa -> archive/old/genomes/b/c.fa',
      'copy reef/raw/reads.fastq -> archive/old/reads.fastq',
      'delete reef/raw/genomes/a.fa',
      'delete reef/raw/genomes/b/c.fa',
      'delete reef/raw/reads.fastq',
    ])
  })

  it('keeps a file that arrived in the folder after the copy', async () => {
    const { fake, calls } = store(['raw/genomes/', 'raw/genomes/a.fa'], false, ['raw/genomes/'])
    // The arrival lands after the copies; a relisting delete would take it.
    fake.copyObject = vi.fn(async (source, bucket, key) => {
      calls.push(`copy ${source.bucket}/${source.key} -> ${bucket}/${key}`)
      if (source.key === 'raw/genomes/a.fa') calls.push('arrived raw/genomes/arrived.txt')
    })

    await runTransfer(fake, 'move', 'reef', [{ key: 'raw/genomes/', folder: true }], { bucket: 'reef', prefix: 'old/' }, null)

    expect(calls).toEqual([
      'copy reef/raw/genomes/ -> reef/old/genomes/',
      'copy reef/raw/genomes/a.fa -> reef/old/genomes/a.fa',
      'arrived raw/genomes/arrived.txt',
      'delete reef/raw/genomes/',
      'delete reef/raw/genomes/a.fa',
    ])
  })

  it('moves the empty folders inside a folder with it', async () => {
    const listed = ['raw/genomes/', 'raw/genomes/a.fa', 'raw/genomes/empty/', 'raw/genomes/empty/deeper/']
    const { fake, calls } = store(listed, false, ['raw/genomes/', 'raw/genomes/empty/', 'raw/genomes/empty/deeper/'])

    await runTransfer(fake, 'move', 'reef', [{ key: 'raw/genomes/', folder: true }], { bucket: 'reef', prefix: 'old/' }, null)

    expect(fake.listObjectsRecursive).toHaveBeenCalledWith('reef', 'raw/genomes/', 1000, null, { markers: true })
    expect(calls.filter((call) => call.startsWith('copy'))).toEqual([
      'copy reef/raw/genomes/ -> reef/old/genomes/',
      'copy reef/raw/genomes/a.fa -> reef/old/genomes/a.fa',
      'copy reef/raw/genomes/empty/ -> reef/old/genomes/empty/',
      'copy reef/raw/genomes/empty/deeper/ -> reef/old/genomes/empty/deeper/',
    ])
    expect(calls.filter((call) => call.startsWith('delete'))).toEqual(listed.map((key) => `delete reef/${key}`))
  })

  it('keeps an empty folder that changed during the move', async () => {
    const { fake, calls, revisions } = store(['raw/genomes/', 'raw/genomes/empty/'], false, ['raw/genomes/', 'raw/genomes/empty/'])
    fake.copyObject = vi.fn(async (source) => {
      if (source.key === 'raw/genomes/empty/') revisions.set('raw/genomes/empty/', 'v2')
    })

    await expect(
      runTransfer(fake, 'move', 'reef', [{ key: 'raw/genomes/', folder: true }], { bucket: 'reef', prefix: 'x/' }, null),
    ).rejects.toThrow('kept: empty')
    expect(calls).toEqual(['delete reef/raw/genomes/'])
  })

  it('keeps the sources of a copy and renames in place', async () => {
    const copy = store()
    await runTransfer(copy.fake, 'copy', 'reef', [{ key: 'raw/reads.fastq', folder: false }], { bucket: 'reef', prefix: 'x/' }, null)
    expect(copy.calls).toEqual(['copy reef/raw/reads.fastq -> reef/x/reads.fastq'])

    const rename = store()
    await runTransfer(rename.fake, 'rename', 'reef', [{ key: 'raw/reads.fastq', folder: false }], { bucket: 'reef', prefix: 'raw/' }, null, 'r2.fastq')
    expect(rename.calls).toEqual(['copy reef/raw/reads.fastq -> reef/raw/r2.fastq', 'delete reef/raw/reads.fastq'])
  })

  it('names only the sources a move took away', async () => {
    const { fake } = store()
    fake.deleteObject = vi.fn(async (_bucket: string, key: string) => {
      if (key === 'raw/b.txt') throw new Error('refused')
    })
    const moved: string[] = []
    const sources = ['raw/a.txt', 'raw/b.txt', 'raw/c.txt'].map((key) => ({ key, folder: false }))

    await expect(
      runTransfer(fake, 'move', 'reef', sources, { bucket: 'reef', prefix: 'x/' }, null, undefined, (key) => moved.push(key)),
    ).rejects.toThrow('refused')
    expect(moved).toEqual(['raw/a.txt'])

    const failedCopy = store()
    failedCopy.fake.copyObject = vi.fn(async () => {
      throw new Error('no space')
    })
    const none: string[] = []
    await expect(
      runTransfer(failedCopy.fake, 'move', 'reef', sources, { bucket: 'reef', prefix: 'x/' }, null, undefined, (key) => none.push(key)),
    ).rejects.toThrow('no space')
    expect(none).toEqual([])
  })

  it('stops before any copy when a folder is too large or empty', async () => {
    const large = store(['raw/genomes/a.fa'], true)
    await expect(runTransfer(large.fake, 'move', 'reef', [{ key: 'raw/genomes/', folder: true }], { bucket: 'reef', prefix: '' }, null)).rejects.toThrow('more than')
    expect(large.calls).toEqual([])

    const empty = store([])
    await expect(runTransfer(empty.fake, 'move', 'reef', [{ key: 'raw/genomes/', folder: true }], { bucket: 'reef', prefix: '' }, null)).rejects.toThrow('holds no files')
    expect(empty.calls).toEqual([])
  })

  it('keeps a file overwritten between its copy and the delete', async () => {
    const { fake, calls, revisions } = store()
    // The copy took v1; the file is then overwritten with v2 before the cleanup.
    fake.copyObject = vi.fn(async (source, bucket, key) => {
      calls.push(`copy ${source.bucket}/${source.key} -> ${bucket}/${key}`)
      if (source.key === 'raw/b.txt') revisions.set('raw/b.txt', 'v2')
    })
    const moved: string[] = []
    const sources = ['raw/a.txt', 'raw/b.txt'].map((key) => ({ key, folder: false }))

    await expect(
      runTransfer(fake, 'move', 'reef', sources, { bucket: 'reef', prefix: 'x/' }, null, undefined, (key) => moved.push(key)),
    ).rejects.toThrow('Changed during the move, kept: b.txt.')
    expect(calls).toContain('delete reef/raw/a.txt')
    expect(calls).not.toContain('delete reef/raw/b.txt')
    expect(moved).toEqual(['raw/a.txt'])
  })

  it('keeps a folder whose file changed during the move', async () => {
    const { fake, calls, revisions } = store(['raw/genomes/a.fa', 'raw/genomes/b.fa'], false, ['raw/genomes/'])
    fake.copyObject = vi.fn(async (source) => {
      if (source.key === 'raw/genomes/b.fa') revisions.set('raw/genomes/b.fa', 'v2')
    })
    const moved: string[] = []

    await expect(
      runTransfer(fake, 'move', 'reef', [{ key: 'raw/genomes/', folder: true }], { bucket: 'reef', prefix: 'x/' }, null, undefined, (key) => moved.push(key)),
    ).rejects.toThrow('kept: b.fa')
    expect(calls).toEqual(['delete reef/raw/genomes/a.fa'])
    expect(moved).toEqual([])
  })
})
