import { describe, expect, it } from 'vitest'
import { MAX_RECENT, openedLabel, parseRecent, withVisit, without } from './recentCollections'

const now = new Date(2026, 10, 19, 15, 0)

describe('withVisit', () => {
  it('puts the visited Collection first with the current time', () => {
    const recent = withVisit([{ id: 'a', name: 'A', openedAt: '2026-11-01T00:00:00.000Z' }], { id: 'b', name: 'B' }, now)

    expect(recent.map((r) => r.id)).toEqual(['b', 'a'])
    expect(recent[0].openedAt).toBe(now.toISOString())
  })

  it('moves a Collection that is already listed, with its new name', () => {
    const start = [
      { id: 'a', name: 'A', openedAt: '2026-11-02T00:00:00.000Z' },
      { id: 'b', name: 'Old', openedAt: '2026-11-01T00:00:00.000Z' },
    ]

    const recent = withVisit(start, { id: 'b', name: 'New' }, now)

    expect(recent.map((r) => [r.id, r.name])).toEqual([
      ['b', 'New'],
      ['a', 'A'],
    ])
  })

  it(`keeps at most ${MAX_RECENT}`, () => {
    let recent = withVisit([], { id: 'first', name: 'first' }, now)
    for (let i = 0; i < MAX_RECENT; i++) recent = withVisit(recent, { id: `c${i}`, name: '' }, now)

    expect(recent).toHaveLength(MAX_RECENT)
    expect(recent.some((r) => r.id === 'first')).toBe(false)
  })
})

describe('without', () => {
  it('removes the Collection', () => {
    const recent = without([{ id: 'a', name: 'A', openedAt: now.toISOString() }], 'a')

    expect(recent).toEqual([])
  })
})

describe('parseRecent', () => {
  it.each([null, '', 'not json', '{}', '42'])('treats %j as empty', (raw) => {
    expect(parseRecent(raw)).toEqual([])
  })

  it('drops malformed entries and keeps good ones', () => {
    const good = { id: 'a', name: 'A', openedAt: '2026-11-19T10:00:00.000Z' }
    const raw = JSON.stringify([good, { id: 1 }, null, { id: 'b', name: 'B', openedAt: 'never' }])

    expect(parseRecent(raw)).toEqual([good])
  })
})

describe('openedLabel', () => {
  it.each([
    [new Date(2026, 10, 19, 0, 5), 'opened today'],
    [new Date(2026, 10, 18, 23, 59), 'opened yesterday'],
    [new Date(2026, 10, 16, 12, 0), 'opened 3 days ago'],
  ])('labels %s as %s', (openedAt, label) => {
    expect(openedLabel(openedAt.toISOString(), now)).toBe(label)
  })
})
