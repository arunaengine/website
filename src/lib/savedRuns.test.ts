import { describe, expect, it } from 'vitest'
import { askedFor, exportRuns, importRuns, readSavedRuns, savedTask, secretNames, withRun, writeSavedRuns, type SavedRun } from './savedRuns'

function memory(): Storage {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
    key: () => null,
    get length() { return items.size },
  }
}

const run = (id: string, name = `Run ${id}`): SavedRun => ({
  id,
  name,
  savedAt: '2026-10-28T10:00:00Z',
  task: {
    name,
    executors: [{ image: 'bakta@sha256:abc', command: ['bakta', '/data/genome.fna'] }],
    inputs: [
      { name: 'genome.fna', path: '/data/genome.fna', url: 's3://lab/genome.fna' },
      { name: 'db', path: '/db', url: 's3://bakta/db/', type: 'DIRECTORY' },
    ],
  },
  ask: { inputs: ['/data/genome.fna'], results: true },
})

describe('saved runs', () => {
  it('keeps runs in the given storage and reads a broken store as none', () => {
    const storage = memory()
    writeSavedRuns([run('a')], storage)
    expect(readSavedRuns(storage).map((item) => item.id)).toEqual(['a'])

    storage.setItem('aruna.myRuns', '{not json')
    expect(readSavedRuns(storage)).toEqual([])
    storage.setItem('aruna.myRuns', JSON.stringify([{ id: 'x' }, run('b')]))
    expect(readSavedRuns(storage).map((item) => item.id)).toEqual(['b'])
  })

  it('replaces a run saved again under its id', () => {
    expect(withRun([run('a'), run('b')], run('a', 'New')).map((item) => item.name)).toEqual(['New', 'Run b'])
  })

  it('exports runs as a file and imports them into another list', () => {
    const file = exportRuns([run('a', 'Shared'), run('b')])
    const merged = importRuns(file, [run('a', 'Old'), run('c')])

    expect(merged.map((item) => [item.id, item.name])).toEqual([['a', 'Shared'], ['c', 'Run c'], ['b', 'Run b']])
    expect(() => importRuns('{"runs": []}', [])).toThrow('not a run templates file')
    expect(() => importRuns('nope', [])).toThrow('not a run templates file')
    expect(() => importRuns(JSON.stringify({ format: 'aruna-my-runs', runs: [{ id: 1 }] }), [])).toThrow('not readable')
  })

  it('names what a run asks for and drops what only a finished run has', () => {
    expect(askedFor(run('a'))).toEqual(['genome.fna', 'results folder'])
    const finished = { ...run('a').task, id: 't1', state: 'COMPLETE' as const, logs: [], creation_time: 'x' }
    expect(Object.keys(savedTask(finished)).sort()).toEqual(['executors', 'inputs', 'name'])
    const keyed = savedTask({ ...finished, tags: { 'aruna-engine.org/idempotency-key': 'k1', project: 'reef' } })
    expect(keyed.tags).toEqual({ project: 'reef' })
  })

  it('never keeps secret-looking values, also from an imported file', () => {
    const env = { AWS_SECRET_ACCESS_KEY: 'abc', api_token: 'xyz', DB_PASSWORD: 'p', THREADS: '8' }
    const secret = { ...run('s'), task: { ...run('s').task, executors: [{ image: 'x', command: ['y'], env }] } }

    expect(savedTask(secret.task).executors[0].env).toEqual({ AWS_SECRET_ACCESS_KEY: '', api_token: '', DB_PASSWORD: '', THREADS: '8' })
    const [imported] = importRuns(exportRuns([secret]), [])
    expect(imported.task.executors[0].env?.AWS_SECRET_ACCESS_KEY).toBe('')
    expect(secretNames(imported)).toEqual(['AWS_SECRET_ACCESS_KEY', 'api_token', 'DB_PASSWORD'])
    expect(askedFor(imported)).toContain('AWS_SECRET_ACCESS_KEY')
  })

  it('refuses runs whose nested fields the menu and start form could not read', () => {
    const broken = [
      { ...run('a'), task: { ...run('a').task, inputs: {} } },
      { ...run('b'), task: { ...run('b').task, executors: [{ image: 'x', command: 'not a list' }] } },
      { ...run('c'), task: { ...run('c').task, executors: [] } },
      { ...run('d'), task: { ...run('d').task, executors: [{ image: 'x', command: [], env: { A: 1 } }] } },
      { ...run('e'), task: { ...run('e').task, outputs: [{ path: '/out' }] } },
      { ...run('f'), task: { ...run('f').task, executors: [{ image: 'x', command: [], workdir: 42 }] } },
      { ...run('g'), task: { ...run('g').task, name: 7 } },
      { ...run('h'), task: { ...run('h').task, resources: { cpu_cores: '2' } } },
      { ...run('i'), task: { ...run('i').task, inputs: [{ path: '/in', type: 'FOLDER' }] } },
      { ...run('j'), task: { ...run('j').task, outputs: [{ path: '/out/*', url: 's3://b/k', path_prefix: 3 }] } },
    ]
    const storage = memory()
    storage.setItem('aruna.myRuns', JSON.stringify([...broken, run('ok')]))
    expect(readSavedRuns(storage).map((item) => item.id)).toEqual(['ok'])
    expect(() => importRuns(exportRuns(broken as SavedRun[]), [])).toThrow('not readable')
    expect(askedFor(readSavedRuns(storage)[0])).toEqual(['genome.fna', 'results folder'])
  })

  it('keeps the exact version ARNs a past run names', () => {
    const arn = 'arn:aruna:realm:node-b:s3/db/x/a%20b.fna@01K8W1B3D5F7H9KMQ1S3V5X7Z1'
    const past = { ...run('a').task, id: 't1', state: 'COMPLETE' as const, inputs: [{ name: 'a', path: '/in/a', url: arn, type: 'FILE' as const }] }
    expect(savedTask(past).inputs?.[0].url).toBe(arn)
    expect(importRuns(exportRuns([{ ...run('a'), task: savedTask(past) }]), [])[0].task.inputs?.[0].url).toBe(arn)
  })
})
