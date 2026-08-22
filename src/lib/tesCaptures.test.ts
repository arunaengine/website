import { describe, expect, it } from 'vitest'
import { captureContainerPath, captureOutput, isFolderCapture, pruneTesTask } from './tes'

describe('output captures', () => {
  it('keeps a file capture a plain FILE output', () => {
    expect(captureOutput('/outputs/report.html', 'results', 'reports/report.html')).toEqual({
      url: 's3://results/reports/report.html',
      path: '/outputs/report.html',
      type: 'FILE',
    })
  })

  it('maps a folder capture to a wildcard output the facade accepts', () => {
    // `type: DIRECTORY` is rejected, so the folder becomes `<folder>/*` plus
    // the literal ancestor the backend strips from each match.
    expect(captureOutput('/outputs/reports/', 'results', 'reports/')).toEqual({
      url: 's3://results/reports',
      path: '/outputs/reports/*',
      path_prefix: '/outputs/reports',
      type: 'FILE',
    })
  })

  it('trims separators so a match lands under the intended key', () => {
    const output = captureOutput('/outputs/reports//', ' results ', '/reports//')

    expect(output.url).toBe('s3://results/reports')
    expect(output.path_prefix).toBe('/outputs/reports')
    // The backend appends the stripped suffix: reports/ + summary.html.
    expect(output.path).toBe('/outputs/reports/*')
  })

  it('restores a folder row from the wildcard output it produced', () => {
    const output = captureOutput('/outputs/reports/', 'results', 'reports/')

    expect(captureContainerPath(output)).toBe('/outputs/reports/')
    expect(isFolderCapture(captureContainerPath(output))).toBe(true)
  })

  it('restores a file capture and a legacy directory output unchanged in kind', () => {
    expect(captureContainerPath({ url: 's3://b/k', path: '/out/a.txt', type: 'FILE' })).toBe('/out/a.txt')
    expect(captureContainerPath({ url: 's3://b/k', path: '/out', type: 'DIRECTORY' })).toBe('/out/')
  })

  it('carries path_prefix through task pruning', () => {
    const task = pruneTesTask({
      executors: [{ image: 'a', command: ['run'] }],
      outputs: [captureOutput('/outputs/reports/', 'results', 'reports/')],
    })

    expect(task.outputs?.[0]).toMatchObject({
      path: '/outputs/reports/*',
      path_prefix: '/outputs/reports',
    })
  })
})
