import { describe, expect, it } from 'vitest'
import type { PartTargetResponse } from '@/lib/api'
import { browseProblem, browseRoute, looksLikePart } from './linkedPart'

const set = 'https://w3id.org/aruna/data/k3V9xQ2m/01K8Y2B6D8/'
const target = (extra: Partial<PartTargetResponse>): PartTargetResponse => ({ id: set, bucket: 'bakrep', prefix: 'raw/2026/', held_here: true, ...extra })

describe('linked part', () => {
  it('tells the id of a bucket or folder from the id of a file or its content', () => {
    expect(looksLikePart(set)).toBe(true)
    expect(looksLikePart(`${set}cmF3LzIwMjYv`)).toBe(true)
    expect(looksLikePart('arn:aruna:r:n:s3/lab-raw-data/raw/')).toBe(true)
    expect(looksLikePart('arn:aruna:r:n:s3/lab/raw/a.fq@01K8Y2B6D8F0H2K4M6P8R0T2V4')).toBe(false)
    expect(looksLikePart('https://w3id.org/aruna/data/k3V9xQ2m/01K8Y2B6D8')).toBe(false)
    expect(looksLikePart(`https://w3id.org/aruna/data/${'a'.repeat(64)}`)).toBe(false)
    expect(looksLikePart('https://example.org/data/a/b/c')).toBe(false)
  })

  it('names why the files cannot be listed from this node', () => {
    expect(browseProblem(target({}))).toBeNull()
    expect(browseProblem(target({ bucket: null }))).toBe('This node has no record of the bucket yet.')
    expect(browseProblem(target({ held_here: false }))).toContain('holds no copy')
  })

  it('opens the folder of the part, on the node of an ordinary bucket that is not this one', () => {
    const local = (id: string) => id === 'n1'

    expect(browseRoute(target({ node_id: 'n1' }), local)).toEqual({ name: 'bucket', params: { bucketId: 'bakrep' }, query: { prefix: 'raw/2026' } })
    expect(browseRoute(target({ node_id: 'n2', prefix: '' }), local).query).toEqual({ node: 'n2' })
    expect(browseRoute(target({ set_id: 's1' }), local).query).toEqual({ prefix: 'raw/2026' })
  })
})
