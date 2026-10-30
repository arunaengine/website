import { describe, expect, it } from 'vitest'
import { holderNode, taskBuckets, type TesTask } from './tes'

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
    expect(holderNode(align, holders, 'node-a')).toBe('node-b')
  })

  it('keeps the connected node when it holds the buckets', () => {
    const holders = new Map([
      ['laptop', ['node-a', 'node-b']],
      ['ncbi-refseq', ['node-a', 'node-b']],
    ])
    expect(holderNode(align, holders, 'node-a')).toBeNull()
  })

  it('falls back to the output holder when no node holds every bucket', () => {
    const holders = new Map([
      ['laptop', ['node-b']],
      ['ncbi-refseq', ['node-c']],
    ])
    expect(holderNode(align, holders, 'node-a')).toBe('node-b')
  })

  it('keeps the connected node for unknown buckets', () => {
    expect(holderNode(align, new Map(), 'node-a')).toBeNull()
  })
})
