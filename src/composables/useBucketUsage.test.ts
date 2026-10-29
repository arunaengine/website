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
  it('names files and size, or the referenced files of a database', () => {
    expect(usageText(usage(), true)).toBe('16 files, 50.2 MB stored')
    expect(usageText(usage({ objects: 1 }))).toBe('1 file, 50.2 MB')
    expect(usageText(usage({ objects: 43_882_006, logical_bytes: 10, referenced_bytes: 10 }), true)).toBe('43,882,006 files referenced')
    expect(usageText(usage({ complete: false }))).toBe('at least 16 files, 50.2 MB')
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
