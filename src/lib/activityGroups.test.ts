import { describe, expect, it } from 'vitest'
import { readFolder, readTransfer, type DeviceTransfer } from './deviceApi'
import { activityCounts, groupActivity, totalProgress, transferOrder } from './activityGroups'

const folders = [
  readFolder({ folder_id: 'f1', root: '/home/me/Runs' }),
  readFolder({ folder_id: 'f2', root: '/home/me/Reports' }),
]
const transfer = (id: string, state: string, extra: Record<string, unknown> = {}): DeviceTransfer =>
  readTransfer({ id, state, path: `${id}.txt`, folder_id: 'f1', ...extra }, 'upload')
const decision = (folderId: string) => ({
  folderId,
  folder: 'x',
  text: 'Kept your version of a.csv',
  atMs: 1,
  outcome: 'applied' as const,
})

const rows = [
  transfer('a', 'done'),
  transfer('b', 'failed'),
  transfer('c', 'transferring', { bytes_total: 100, bytes_done: 40 }),
  transfer('d', 'queued', { bytes_total: 50 }),
  transfer('e', 'done', { folder_id: 'f2' }),
]

describe('activity counts', () => {
  it('counts rows and decisions the way the filter chips show them', () => {
    expect(activityCounts(rows, [decision('f1')])).toEqual({ all: 6, progress: 2, failed: 1, done: 2, decisions: 1 })
  })
})

describe('activity groups', () => {
  it('pins failed files above moving, waiting and finished ones', () => {
    const [first] = groupActivity(folders, rows, [], 'all')

    expect(first?.name).toBe('Runs')
    expect(first?.rows.map((row) => row.id)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('keeps an idle folder under All and drops it under a filter', () => {
    const idle = [transfer('a', 'done')]

    expect(groupActivity(folders, idle, [], 'all').map((group) => group.name)).toEqual(['Runs', 'Reports'])
    expect(groupActivity(folders, idle, [], 'failed')).toEqual([])
    expect(groupActivity(folders, idle, [], 'done').map((group) => group.name)).toEqual(['Runs'])
  })

  it('shows decisions only under All and Decisions', () => {
    const list = [decision('f2')]

    expect(groupActivity(folders, [], list, 'all')[1]?.decisions).toHaveLength(1)
    expect(groupActivity(folders, rows, list, 'decisions').map((group) => group.name)).toEqual(['Reports'])
    expect(groupActivity(folders, rows, list, 'decisions')[0]?.rows).toEqual([])
    expect(groupActivity(folders, rows, list, 'progress').every((group) => group.decisions.length === 0)).toBe(true)
  })

  it('gathers transfers of no known folder in one card', () => {
    const stray = transfer('z', 'queued', { folder_id: null })
    const groups = groupActivity(folders, [stray], [], 'progress')

    expect(groups.map((group) => group.name)).toEqual(['Other transfers'])
  })
})

describe('transfer order', () => {
  it('puts the file in flight before waiting ones and compares paths plainly', () => {
    const sorted = [
      transfer('b', 'queued'),
      transfer('Z', 'queued'),
      transfer('c', 'running'),
      transfer('a', 'retrying'),
      transfer('d', 'failed'),
    ].sort(transferOrder)

    expect(sorted.map((row) => row.id)).toEqual(['d', 'c', 'a', 'Z', 'b'])
  })
})

describe('total progress', () => {
  it('sums the bytes of open transfers when each one is counted', () => {
    expect(totalProgress([rows[2]!, rows[3]!])).toEqual({ done: 40, total: 150 })
    expect(totalProgress([transfer('x', 'running', { bytes_total: 10, bytes_done: 4 })])).toEqual({ done: 4, total: 10 })
  })

  it('says nothing while any open transfer has no counted bytes', () => {
    expect(totalProgress([rows[2]!, transfer('x', 'running', { bytes_total: 10 })])).toBeNull()
    expect(totalProgress([transfer('y', 'queued')])).toBeNull()
    expect(totalProgress([rows[0]!])).toBeNull()
  })
})
