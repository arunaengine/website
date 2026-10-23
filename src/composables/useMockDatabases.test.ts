import { describe, expect, it } from 'vitest'
import { useMockDatabases } from './useMockDatabases'

describe('database bucket marks of the node mock', () => {
  it('keeps a new mark out of the lists until the group admins agree', () => {
    const marks = useMockDatabases()
    marks.add({ name: 'lab-raw-data', description: 'Raw reads', source: 'Lab', license: 'CC BY 4.0', refresh: 'Off', readers: 'Everyone in the realm', bucket: 'lab-raw-data' })
    const added = marks.all.value.find((entry) => entry.bucket === 'lab-raw-data')!

    expect(added.status).toBe('pending')
    expect(marks.entries.value.some((entry) => entry.bucket === 'lab-raw-data')).toBe(false)
    marks.agree(added.id)
    expect(marks.entries.value.some((entry) => entry.bucket === 'lab-raw-data')).toBe(true)
    marks.remove(added.id)
    expect(marks.entries.value.some((entry) => entry.bucket === 'lab-raw-data')).toBe(false)
  })

  it('lists the curators once however often a role is granted', () => {
    const marks = useMockDatabases()
    expect(marks.curators.value.map((role) => role.name)).toEqual(['Database curators'])
    marks.grant({ name: 'Data stewards', users: ['Ana Lopez'] })
    marks.grant({ name: 'Data stewards', users: ['Ana Lopez'] })
    expect(marks.curators.value.map((role) => role.name)).toEqual(['Database curators', 'Data stewards'])
  })
})
