import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { BucketUsageResponse } from '@/lib/api'

const asked: { bucket: string; node: string | null; resolve: (usage: BucketUsageResponse) => void }[] = []
vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({
    sessionEpoch: ref(1),
    getBucketUsage: (bucket: string, node: string | null) => new Promise<BucketUsageResponse>((resolve) => asked.push({ bucket, node, resolve })),
  }),
}))
const { usageParts, usageText, useBucketUsage } = await import('./useBucketUsage')
const { lastUpload } = await import('./uploadQueueState')
const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

const usage = (extra: Partial<BucketUsageResponse> = {}): BucketUsageResponse => ({
  bucket: 'laptop', objects: 16, versions: 16, delete_markers: 0, open_multipart_uploads: 0, logical_bytes: 52_638_515, complete: true, ...extra,
})

describe('bucket usage', () => {
  it('names the files with the stored and the referenced size, each only when it is not 0', () => {
    expect(usageText(usage())).toBe('16\u00a0files, 50.2\u00a0MiB stored')
    expect(usageText(usage({ objects: 1, referenced_bytes: 0 }))).toBe('1\u00a0file, 50.2\u00a0MiB stored')
    expect(usageText(usage({ objects: 43_882_006, logical_bytes: 0, referenced_bytes: 42_450_742_909_920 })))
      .toBe('43,882,006\u00a0files, 38.6\u00a0TiB referenced')
    expect(usageText(usage({ objects: 70, logical_bytes: 4_112_885_380, referenced_bytes: 1_344_199_496 })))
      .toBe('70\u00a0files, 3.8\u00a0GiB stored, 1.3\u00a0GiB referenced')
    expect(usageText(usage({ objects: 0, logical_bytes: 0, referenced_bytes: 0 }))).toBe('0\u00a0files, 0\u00a0B stored')
    expect(usageText(usage({ complete: false }))).toBe('at least 16\u00a0files, 50.2\u00a0MiB stored')
  })

  it('splits the line into the file count and each size that is not 0', () => {
    expect(usageParts(usage())).toEqual({ files: '16', stored: '50.2\u00a0MiB', referenced: null })
    expect(usageParts(usage({ objects: 43_882_006, logical_bytes: 0, referenced_bytes: 42_450_742_909_920 })))
      .toEqual({ files: '43,882,006', stored: null, referenced: '38.6\u00a0TiB' })
    expect(usageParts(usage({ objects: 70, logical_bytes: 4_112_885_380, referenced_bytes: 1_344_199_496 })))
      .toEqual({ files: '70', stored: '3.8\u00a0GiB', referenced: '1.3\u00a0GiB' })
    expect(usageParts(usage({ complete: false })).files).toBe('≥\u00a016')
  })

  it('keeps only the answer for the bucket still open', async () => {
    const bucket = ref('laptop')
    const node = ref<string | null>(null)
    const read = useBucketUsage(bucket, node)
    bucket.value = 'other'
    node.value = 'n2'
    await nextTick()
    expect(asked.map((entry) => `${entry.node}/${entry.bucket}`)).toEqual(['null/laptop', 'n2/other'])

    asked[0].resolve(usage())
    await Promise.resolve()
    expect(read.value).toBeNull()
    asked[1].resolve(usage({ bucket: 'other', objects: 3 }))
    await Promise.resolve()
    await Promise.resolve()
    expect(read.value?.objects).toBe(3)
  })

  it('reads the count again after an upload into the open bucket and keeps the old one meanwhile', async () => {
    asked.length = 0
    const read = useBucketUsage(ref('fresh'), ref<string | null>('n2'))
    asked[0].resolve(usage({ bucket: 'fresh', objects: 0, logical_bytes: 0 }))
    await settle()

    lastUpload.value = { bucket: 'fresh', key: 'a.txt', nodeId: null, at: 1 }
    await nextTick()
    expect(asked).toHaveLength(1)
    lastUpload.value = { bucket: 'fresh', key: 'a.txt', nodeId: 'n2', at: 2 }
    await nextTick()
    expect(asked).toHaveLength(2)
    expect(read.value?.objects).toBe(0)

    asked[1].resolve(usage({ bucket: 'fresh', objects: 4 }))
    await settle()
    expect(read.value?.objects).toBe(4)
  })
})

describe('listed bucket usage', () => {
  it('asks each bucket once, four at a time, and names it once read', async () => {
    asked.length = 0
    const { useListedUsage } = await import('./useBucketUsage')
    const listed = useListedUsage()
    const entries = ['a', 'b', 'c', 'd', 'e'].map((bucket) => ({ bucket, nodeId: bucket === 'e' ? 'n2' : null }))
    listed.ensure(entries)
    listed.ensure(entries)
    expect(asked.map((entry) => entry.bucket)).toEqual(['a', 'b', 'c', 'd'])

    asked[0].resolve(usage({ bucket: 'a', objects: 2 }))
    await Promise.resolve()
    await Promise.resolve()
    expect(asked.map((entry) => `${entry.node}/${entry.bucket}`).at(-1)).toBe('n2/e')
    expect(listed.textOf('a', null)).toBe('2\u00a0files, 50.2\u00a0MiB stored')
    expect(listed.textOf('b', null)).toBeNull()
    listed.ensure(entries)
    expect(asked).toHaveLength(5)
  })

  it('reads a listed bucket again after an upload into it', async () => {
    const { useListedUsage } = await import('./useBucketUsage')
    for (const entry of asked.splice(0)) entry.resolve(usage({ bucket: entry.bucket }))
    await settle()
    const listed = useListedUsage()
    listed.ensure([{ bucket: 'up', nodeId: 'n2' }])
    asked.splice(0)[0].resolve(usage({ bucket: 'up', objects: 0, logical_bytes: 0 }))
    await settle()
    expect(listed.textOf('up', 'n2')).toBe('0\u00a0files, 0\u00a0B stored')

    lastUpload.value = { bucket: 'up', key: 'a.txt', nodeId: 'n2', at: 3 }
    await nextTick()
    expect(listed.textOf('up', 'n2')).toBe('0\u00a0files, 0\u00a0B stored')
    asked.splice(0)[0].resolve(usage({ bucket: 'up', objects: 4 }))
    await settle()
    expect(listed.textOf('up', 'n2')).toBe('4\u00a0files, 50.2\u00a0MiB stored')
  })
})
