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
const { usageText, useBucketUsage } = await import('./useBucketUsage')

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
})
