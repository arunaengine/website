import { describe, expect, it } from 'vitest'
import { askedFor, exportRuns, importRuns, readSavedRuns, savedTask, withRun, writeSavedRuns, type SavedRun } from './savedRuns'

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
    expect(() => importRuns('{"runs": []}', [])).toThrow('not a saved runs file')
    expect(() => importRuns('nope', [])).toThrow('not a saved runs file')
    expect(() => importRuns(JSON.stringify({ format: 'aruna-my-runs', runs: [{ id: 1 }] }), [])).toThrow('not readable')
  })

  it('names what a run asks for and drops what only a finished run has', () => {
    expect(askedFor(run('a'))).toEqual(['genome.fna', 'results folder'])
    const finished = { ...run('a').task, id: 't1', state: 'COMPLETE' as const, logs: [], creation_time: 'x' }
    expect(Object.keys(savedTask(finished)).sort()).toEqual(['executors', 'inputs', 'name'])
  })
})
