import { describe, expect, it } from 'vitest'
import { checkPaths, classifyPath, scanPaths, type RunPathTargets } from '@/lib/runPaths'

const targets: RunPathTargets = {
  workdir: '/work',
  scriptPath: '/work/script.py',
  inputs: ['/work/in/reads.fq.gz', '/work/in/reference.fa'],
  outputs: ['/work/out/counts.tsv', '/work/out/plots/'],
}

describe('scanPaths', () => {
  it('resolves relative paths against the working directory', () => {
    expect(scanPaths('read in/reads.fq.gz then out/counts.tsv', '/work')).toEqual([
      '/work/in/reads.fq.gz',
      '/work/out/counts.tsv',
    ])
  })

  it('keeps container paths already under the working directory', () => {
    expect(scanPaths('uv run --no-project /work/script.py', '/work')).toEqual(['/work/script.py'])
  })

  it('ignores options, urls, package names and paths outside the workdir', () => {
    const text = '--config=x s3://bucket/key jsr:@std/io /etc/passwd 1.2/3 plain'
    expect(scanPaths(text, '/work')).toEqual([])
  })

  it('splits on quotes and shell punctuation', () => {
    expect(scanPaths('zcat "in/a.gz" | sort > out/b.tsv', '/work')).toEqual([
      '/work/in/a.gz',
      '/work/out/b.tsv',
    ])
  })

  it('reports every path once', () => {
    expect(scanPaths('cp in/a.txt in/a.txt', '/work')).toEqual(['/work/in/a.txt'])
  })
})

describe('classifyPath', () => {
  it('names the script, an input and a captured file', () => {
    expect(classifyPath('/work/script.py', targets).kind).toBe('script')
    expect(classifyPath('/work/in/reads.fq.gz', targets).kind).toBe('input')
    expect(classifyPath('/work/out/counts.tsv', targets).kind).toBe('captured')
  })

  it('credits a folder capture for the files below it', () => {
    const check = classifyPath('/work/out/plots/coverage.png', targets)
    expect(check.kind).toBe('captured-folder')
    expect(check.label).toBe('captured by /work/out/plots/')
  })

  it('offers Add input for a missing path under the input folder', () => {
    const check = classifyPath('/work/in/annotation.gtf', targets)
    expect(check.kind).toBe('missing-input')
    expect(check.fix).toBe('input')
  })

  it('offers Capture for anything else the run writes', () => {
    const file = classifyPath('/work/out/report.html', targets)
    expect(file.fix).toBe('capture')
    expect(file.label).toBe('not captured')
    const folder = classifyPath('/work/results/', targets)
    expect(folder.label).toBe('folder not captured')
  })

  it('counts the inputs staged in a folder that is read whole', () => {
    expect(classifyPath('/work/in/', targets).label).toBe('2 inputs')
  })
})

describe('checkPaths', () => {
  it('reports what a script text still needs', () => {
    const checks = checkPaths('open("in/reads.fq.gz"); write("out/new.tsv")', targets)
    expect(checks.map((check) => check.kind)).toEqual(['input', 'missing-capture'])
  })

  it('is empty for a command that names no path', () => {
    expect(checkPaths('echo hello', targets)).toEqual([])
  })
})
