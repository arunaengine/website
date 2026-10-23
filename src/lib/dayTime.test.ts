import { describe, expect, it } from 'vitest'
import { dayTime } from './dayTime'

const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).getTime()
const now = at(23, 12, 0)

describe('day and time', () => {
  it('says today and yesterday in words', () => {
    expect(dayTime(at(23, 9, 15), now)).toBe('Today, 09:15')
    expect(dayTime(at(22, 16, 42), now)).toBe('Yesterday, 16:42')
  })

  it('names a weekday inside the last week and a date beyond it', () => {
    expect(dayTime(at(19, 11, 3), now)).toMatch(/^[A-Za-z]+, 11:03$/)
    expect(dayTime(at(12, 14, 20), now)).toMatch(/12.*14:20/)
    expect(dayTime(at(12, 14, 20), now)).not.toMatch(/Today|Yesterday/)
  })
})
