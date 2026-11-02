import { describe, expect, it } from 'vitest'
import { PREVIEW_LINES, contentPreview, firstLines, looksBinary, previewFormat } from './contentPreview'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('previewFormat', () => {
  it('names the format of text files by name or content type', () => {
    expect(previewFormat('report.json')).toEqual({ kind: 'text', language: 'json' })
    expect(previewFormat('config.yaml')).toEqual({ kind: 'text', language: 'yaml' })
    expect(previewFormat('Cargo.toml')).toEqual({ kind: 'text', language: 'toml' })
    expect(previewFormat('feed.xml')).toEqual({ kind: 'text', language: 'xml' })
    expect(previewFormat('plot.R')).toEqual({ kind: 'text', language: 'r' })
    expect(previewFormat('run.sh')).toEqual({ kind: 'text', language: 'shell' })
    expect(previewFormat('genome.fasta')).toEqual({ kind: 'text', language: 'fasta' })
    expect(previewFormat('reads.fq')).toEqual({ kind: 'text', language: 'fastq' })
    expect(previewFormat('samples.csv')).toEqual({ kind: 'table', language: 'csv' })
    expect(previewFormat('samples.tsv')).toEqual({ kind: 'table', language: 'tsv' })
    expect(previewFormat('README.md')).toEqual({ kind: 'markdown', language: 'markdown' })
    expect(previewFormat('object', 'application/json')).toEqual({ kind: 'text', language: 'json' })
  })

  it('gives images, archives and unknown types no preview', () => {
    expect(previewFormat('chart.png')).toBeNull()
    expect(previewFormat('reads.bam')).toBeNull()
    expect(previewFormat('data', 'application/octet-stream')).toBeNull()
  })
})

describe('contentPreview', () => {
  it('formats a JSON file read whole', () => {
    expect(contentPreview(bytes('{"reads":12}'), true, 'summary.json')).toEqual({
      kind: 'text',
      language: 'json',
      text: '{\n  "reads": 12\n}',
      truncated: false,
    })
  })

  it('never parses JSON the read did not finish, and drops the cut line', () => {
    const preview = contentPreview(bytes('{"a": 1,\n"b": [1, 2, 3'), false, 'big.json')

    expect(preview).toEqual({ kind: 'text', language: 'json', text: '{"a": 1,', truncated: true })
  })

  it('shows only the first lines of a long file', () => {
    const text = Array.from({ length: 100 }, (_, index) => `>seq${index}\nACGT`).join('\n')
    const preview = contentPreview(bytes(text), true, 'genome.fasta')!

    expect(preview.text.split('\n')).toHaveLength(PREVIEW_LINES)
    expect(preview.truncated).toBe(true)
  })

  it('keeps a character split by the end of the read out of the text', () => {
    const encoded = bytes('name\nMünster')
    const preview = contentPreview(encoded.slice(0, encoded.length - 6), false, 'towns.txt')!

    expect(preview.text).toBe('name')
  })

  it('skips bytes that are not text even under a text name', () => {
    expect(contentPreview(new Uint8Array([0x7b, 0x00, 0x22]), true, 'odd.json')).toBeNull()
    expect(contentPreview(bytes('anything'), true, 'chart.png')).toBeNull()
  })
})

describe('looksBinary', () => {
  it('tells text from binary bytes', () => {
    expect(looksBinary(bytes('a,b\n1,2\n\ttab'))).toBe(false)
    expect(looksBinary(new Uint8Array([1, 2, 3, 4, 5, 6]))).toBe(true)
  })
})

describe('firstLines', () => {
  it('cuts very long single lines as well', () => {
    const result = firstLines('x'.repeat(20_000))

    expect(result.cut).toBe(true)
    expect(result.text.length).toBeLessThan(20_000)
  })

  it('leaves a short text whole', () => {
    expect(firstLines('one\ntwo')).toEqual({ text: 'one\ntwo', cut: false })
  })
})
