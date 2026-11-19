import { describe, expect, it } from 'vitest'
import { calendarDaysBetween, lastChangedLabel } from './dates'

const now = new Date(2026, 10, 19, 15, 0)
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

describe('calendarDaysBetween', () => {
  it('counts local calendar days, not 24-hour periods', () => {
    expect(calendarDaysBetween(new Date(2026, 10, 19, 0, 1), now)).toBe(0)
    expect(calendarDaysBetween(new Date(2026, 10, 18, 23, 59), now)).toBe(1)
    expect(calendarDaysBetween(new Date(2026, 10, 9, 15, 0), now)).toBe(10)
  })
})

describe('lastChangedLabel', () => {
  it('shows the time for today and yesterday', () => {
    const today = new Date(2026, 10, 19, 14, 2)
    const yesterday = new Date(2026, 10, 18, 9, 15)

    expect(lastChangedLabel(today.toISOString(), now)).toBe(`today ${time(today)}`)
    expect(lastChangedLabel(yesterday.toISOString(), now)).toBe(`yesterday ${time(yesterday)}`)
  })

  it('shows the date for anything older', () => {
    const older = new Date(2026, 9, 3, 12, 0)

    expect(lastChangedLabel(older.toISOString(), now)).toBe(
      older.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    )
  })
})
