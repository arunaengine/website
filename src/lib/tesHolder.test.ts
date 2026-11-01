import { describe, expect, it } from 'vitest'
import { runRoute, taskBuckets, type TesTask } from './tes'

const align: Pick<TesTask, 'inputs' | 'outputs'> = {
  inputs: [
    { url: 's3://laptop/my-genome/genome.fasta', path: '/work/in/genome.fasta' },
    { url: 's3://ncbi-refseq/GCF_000005845.2/genomic.fna.gz', path: '/work/in/ref.fna.gz' },
    { url: 'arn:aruna:realm:node-c:s3/other/a.txt@01M6', path: '/work/in/a.txt' },
  ],
  outputs: [{ url: 's3://laptop/results/alignment-e2e/', path: '/work/out', type: 'DIRECTORY' }],
}

describe('run holder node', () => {
  it('names each s3 bucket once and skips ARNs', () => {
    expect(taskBuckets(align)).toEqual({ inputs: ['laptop', 'ncbi-refseq'], outputs: ['laptop'] })
  })

  it('sends the run to the node holding its buckets', () => {
    const holders = new Map([
      ['laptop', ['node-b']],
      ['ncbi-refseq', ['node-c', 'node-b']],
    ])
    expect(runRoute(align, holders, 'node-a')).toEqual({ node: 'node-b', pin: [] })
  })

  it('keeps the connected node when it holds the buckets', () => {
    const holders = new Map([
      ['laptop', ['node-a', 'node-b']],
      ['ncbi-refseq', ['node-a', 'node-b']],
    ])
    expect(runRoute(align, holders, 'node-a')).toEqual({ node: null, pin: [] })
  })

  it('sends the run to the output holder and pins the inputs of other nodes', () => {
    const holders = new Map([
      ['laptop', ['node-b']],
      ['ncbi-refseq', ['node-c']],
    ])
    expect(runRoute(align, holders, 'node-a')).toEqual({ node: 'node-b', pin: ['ncbi-refseq'] })
  })

  it('sends a run of pinned inputs alone to the node they name', () => {
    const pinned = { inputs: [align.inputs![2]!], outputs: [] }
    expect(runRoute(pinned, new Map(), 'node-a')).toEqual({ node: 'node-c', pin: [] })
    expect(runRoute(pinned, new Map(), 'node-c')).toEqual({ node: null, pin: [] })
    expect(runRoute({ inputs: [], outputs: [] }, new Map(), 'node-a')).toEqual({ node: null, pin: [] })
  })

  it('finds no route when no node holds every output bucket', () => {
    const split = { ...align, outputs: [...align.outputs!, { url: 's3://ncbi-refseq/out/', path: '/work/out2', type: 'DIRECTORY' as const }] }
    const holders = new Map([
      ['laptop', ['node-b']],
      ['ncbi-refseq', ['node-c']],
    ])
    expect(runRoute(split, holders, 'node-a')).toBeNull()
    expect(runRoute(align, new Map(), 'node-a')).toBeNull()
  })
})
