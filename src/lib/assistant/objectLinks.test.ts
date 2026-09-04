import MarkdownIt from 'markdown-it'
import { afterEach, describe, expect, it } from 'vitest'
import { setKnownBuckets } from '@/lib/knownBuckets'
import {
  bucketHref,
  objectHref,
  objectLinks,
  parseObjectRef,
  resolveBucketRef,
  resolveObjectRef,
} from './objectLinks'

afterEach(() => setKnownBuckets([]))

function render(text: string, bucket?: string): string {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  objectLinks(md)
  return md.render(text, bucket ? { bucket } : {})
}

describe('parseObjectRef', () => {
  it('reads an s3 url and a bare bucket and key', () => {
    expect(parseObjectRef('s3://lorem/results/gc_analysis_rerun.json')).toEqual({
      bucket: 'lorem',
      key: 'results/gc_analysis_rerun.json',
    })
    expect(parseObjectRef('lorem/results/gc_analysis_rerun.json')).toEqual({
      bucket: 'lorem',
      key: 'results/gc_analysis_rerun.json',
    })
  })

  it('leaves prose with a slash alone', () => {
    expect(parseObjectRef('and/or')).toBeNull()
    expect(parseObjectRef('input/output')).toBeNull()
    expect(parseObjectRef('https://example.test/report.json')).toBeNull()
    expect(parseObjectRef('/results/report.json')).toBeNull()
    expect(parseObjectRef('UPPER/report.json')).toBeNull()
  })

  it('accepts an s3 url whose key has no file extension', () => {
    expect(parseObjectRef('s3://lorem/results')).toEqual({ bucket: 'lorem', key: 'results' })
  })
})

describe('resolveObjectRef', () => {
  it('reads a bare file name once the bucket is known', () => {
    setKnownBuckets(['test'])

    expect(resolveObjectRef('preview_check.json', 'test')).toEqual({ bucket: 'test', key: 'preview_check.json' })
    expect(resolveObjectRef('test/notes/hello.txt', undefined))
      .toEqual({ bucket: 'test', key: 'notes/hello.txt' })
    expect(resolveObjectRef('test/notes/hello.txt', 'test'))
      .toEqual({ bucket: 'test', key: 'notes/hello.txt' })
  })

  it('splits nothing before the portal has listed a bucket', () => {
    // A wrong link to a bucket that does not exist is worse than no link.
    expect(resolveObjectRef('test/notes/hello.txt', undefined)).toBeNull()
    expect(resolveObjectRef('notes/hello.txt', 'test')).toEqual({ bucket: 'test', key: 'notes/hello.txt' })
  })

  it('leaves a bare name without a bucket as prose', () => {
    expect(resolveObjectRef('preview_check.json', undefined)).toBeNull()
    expect(resolveObjectRef('preview_check.json', '')).toBeNull()
    expect(resolveObjectRef('preview_check.json', 'NOT A BUCKET')).toBeNull()
  })

  it('leaves an ordinary word alone even with a bucket', () => {
    expect(resolveObjectRef('finished', 'test')).toBeNull()
    expect(resolveObjectRef('Node.js', 'test')).toBeNull()
    expect(resolveObjectRef('12.5', 'test')).toBeNull()
  })

  it('keeps a key with slashes inside the bucket it belongs to', () => {
    // The value is a key in the listed bucket, never a bucket of its own.
    expect(resolveObjectRef('notes/hello.txt', 'test')).toEqual({ bucket: 'test', key: 'notes/hello.txt' })
    expect(resolveObjectRef('.aruna/scripts/01M1NX/script.py', 'test'))
      .toEqual({ bucket: 'test', key: '.aruna/scripts/01M1NX/script.py' })
  })

  it('invents no bucket once the portal has listed its own', () => {
    setKnownBuckets(['test'])

    expect(resolveObjectRef('notes/hello.txt', undefined)).toBeNull()
    expect(resolveObjectRef('notes/hello.txt', 'test')).toEqual({ bucket: 'test', key: 'notes/hello.txt' })
  })

  it('still reads an s3 url as its own bucket', () => {
    expect(resolveObjectRef('s3://lorem/results/report.json', 'test'))
      .toEqual({ bucket: 'lorem', key: 'results/report.json' })
  })

  it('splits a path that starts with another listed bucket', () => {
    setKnownBuckets(['lorem'])

    expect(resolveObjectRef('lorem/results/report.json', 'test'))
      .toEqual({ bucket: 'lorem', key: 'results/report.json' })
  })
})

describe('resolveBucketRef', () => {
  it('names only a bucket the portal has listed', () => {
    setKnownBuckets(['test', 'lorem'])

    expect(resolveBucketRef('test')).toBe('test')
    expect(resolveBucketRef(' lorem ')).toBe('lorem')
    expect(resolveBucketRef('notes')).toBeNull()
    expect(resolveBucketRef('NotABucket')).toBeNull()
  })
})

describe('bucketHref', () => {
  it('opens the bucket in the data browser', () => {
    expect(bucketHref('lorem')).toBe('/app/buckets/lorem')
  })
})

describe('objectHref', () => {
  it('opens the object and its folder in the data browser', () => {
    expect(objectHref({ bucket: 'lorem', key: 'results/gc_analysis_rerun.json' }))
      .toBe('/app/buckets/lorem?prefix=results&object=results%2Fgc_analysis_rerun.json')
    expect(objectHref({ bucket: 'lorem', key: 'report.json' }))
      .toBe('/app/buckets/lorem?object=report.json')
  })
})

describe('objectLinks', () => {
  it('links an s3 url and a bare path written in prose', () => {
    setKnownBuckets(['lorem'])
    const s3 = render('The full result is at s3://lorem/results/gc_analysis_rerun.json.')
    const bare = render('Written to lorem/results/gc_analysis_rerun.json, ready to read.')
    const href = 'href="/app/buckets/lorem?prefix=results&amp;object=results%2Fgc_analysis_rerun.json"'

    expect(s3).toContain(href)
    expect(s3).toContain('>s3://lorem/results/gc_analysis_rerun.json</a>')
    expect(s3).toContain('.</p>')
    expect(bare).toContain(href)
    expect(bare).toContain(', ready to read.</p>')
  })

  it('links a path written as inline code', () => {
    setKnownBuckets(['lorem'])
    const markup = render('Read `lorem/results/gc_analysis_rerun.json` for the numbers.')

    expect(markup).toContain('<a href="/app/buckets/lorem?prefix=results&amp;object=results%2Fgc_analysis_rerun.json"')
    expect(markup).toContain('<code>lorem/results/gc_analysis_rerun.json</code>')
  })

  it('leaves a path inside a fenced code block alone', () => {
    const fenced = render('```sh\naws s3 cp lorem/results/gc_analysis_rerun.json .\n```')
    const indented = render('    lorem/results/gc_analysis_rerun.json\n')

    expect(fenced).not.toContain('<a ')
    expect(indented).not.toContain('<a ')
  })

  it('links a bare file name once a bucket is known', () => {
    setKnownBuckets(['lorem'])
    const browsing = render('I wrote preview_check.json for you.', 'test')
    const named = render('Read lorem/results/report.json, then preview_check.json.')
    const unknown = render('I wrote preview_check.json for you.')
    const fenced = render('```sh\ncat preview_check.json\n```', 'test')

    expect(browsing).toContain('href="/app/buckets/test?object=preview_check.json"')
    expect(named).toContain('href="/app/buckets/lorem?object=preview_check.json"')
    expect(unknown).not.toContain('<a ')
    expect(fenced).not.toContain('<a ')
  })

  it('leaves ordinary words alone even while a bucket is known', () => {
    const prose = render('The run finished and wrote 12.5 GB with Node.js.', 'test')

    expect(prose).not.toContain('<a ')
  })

  it('links a bucket the portal has listed from inline code, never from prose', () => {
    // A bucket called test would otherwise link every "test" in a sentence.
    setKnownBuckets(['lorem'])
    const prose = render('Everything landed in lorem, ready to read.')
    const code = render('Read `lorem` for the numbers.')

    expect(prose).not.toContain('<a ')
    expect(code).toContain('<a href="/app/buckets/lorem" data-bucket="lorem"><code>lorem</code></a>')
  })

  it('leaves a word that is not a listed bucket as prose', () => {
    const unlisted = render('Everything landed in lorem, ready to read.')

    expect(unlisted).not.toContain('<a ')
  })

  it('leaves a plain word with a slash and an external link alone', () => {
    const prose = render('Check the input/output section and read/write access.')
    const external = render('See [the docs](https://example.test/report.json).')

    expect(prose).not.toContain('<a ')
    expect(external).not.toContain('/app/buckets/')
  })
})
