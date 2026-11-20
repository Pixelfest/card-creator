import { describe, expect, it } from 'vitest'
import { mergeRemote, mirrorOf, planNext } from './sync'
import { card, serverCard } from './testing'

describe('planNext', () => {
  const a = card('A')
  const b = card('B')

  it('is null when the editor and the server match', () => {
    expect(planNext([a, b], mirrorOf([serverCard(a), serverCard(b)]))).toBeNull()
  })

  it('deletes first, then creates, then saves, then reorders', () => {
    const c = card('C')
    const server = mirrorOf([serverCard(a), serverCard(b)])
    const local = [{ ...a, name: 'A2' }, c] // b deleted, c new, a renamed

    expect(planNext(local, server)?.kind).toBe('delete')
    server.cards.delete(b.id)
    server.order = [a.id]
    expect(planNext(local, server)).toMatchObject({ kind: 'create', card: c, position: 1 })
    server.cards.set(c.id, { version: 1, content: c })
    server.order = [a.id, c.id]
    expect(planNext(local, server)).toMatchObject({ kind: 'save', id: a.id, version: 1 })
  })

  it('reorders when only the order differs', () => {
    expect(planNext([b, a], mirrorOf([serverCard(a), serverCard(b)]))).toEqual({ kind: 'reorder', order: [b.id, a.id] })
  })

  it('ignores object key order in designs (jsonb reorders keys)', () => {
    const reordered = { ...a, design: { snippets: {}, artwork: null, frame: null, fill: '#ffffff' } }
    expect(planNext([reordered], mirrorOf([serverCard(a)]))).toBeNull()
  })

  it('does not save a Card that is waiting on a conflict choice', () => {
    const edited = { ...a, name: 'Mine' }
    expect(planNext([edited], mirrorOf([serverCard(a)]), new Set([a.id]))).toBeNull()
  })
})

describe('mergeRemote', () => {
  it('takes changes made elsewhere for Cards not edited here', () => {
    const a = card('A')
    const server = mirrorOf([serverCard(a)])

    const merged = mergeRemote([a], server, [serverCard({ ...a, name: 'Theirs' }, 2)])

    expect(merged.local.map((c) => c.name)).toEqual(['Theirs'])
    expect(merged.server.cards.get(a.id)?.version).toBe(2)
  })

  it('keeps unsaved local edits (the stale version later surfaces as a conflict)', () => {
    const a = card('A')
    const server = mirrorOf([serverCard(a)])

    const merged = mergeRemote([{ ...a, name: 'Mine' }], server, [serverCard({ ...a, name: 'Theirs' }, 2)])

    expect(merged.local.map((c) => c.name)).toEqual(['Mine'])
    expect(merged.server.cards.get(a.id)?.version).toBe(1)
  })

  it('adds Cards created elsewhere and drops Cards deleted elsewhere', () => {
    const a = card('A')
    const b = card('B')
    const c = card('C')
    const server = mirrorOf([serverCard(a), serverCard(b)])

    const merged = mergeRemote([a, b], server, [serverCard(a), serverCard(c, 1, 1)])

    expect(merged.local.map((x) => x.name)).toEqual(['A', 'C'])
    expect(planNext(merged.local, merged.server)).toBeNull()
  })

  it('does not bring back a Card deleted here whose delete is still pending', () => {
    const a = card('A')
    const b = card('B')
    const server = mirrorOf([serverCard(a), serverCard(b)])

    const merged = mergeRemote([a], server, [serverCard(a), serverCard(b)])

    expect(merged.local.map((x) => x.name)).toEqual(['A'])
    expect(planNext(merged.local, merged.server)).toEqual({ kind: 'delete', id: b.id })
  })

  it("follows the server's order unless this editor has an unsaved reorder", () => {
    const a = card('A')
    const b = card('B')
    const server = mirrorOf([serverCard(a), serverCard(b)])

    expect(mergeRemote([a, b], server, [serverCard(b), serverCard(a)]).local.map((x) => x.name)).toEqual(['B', 'A'])
    expect(mergeRemote([b, a], server, [serverCard(a), serverCard(b)]).local.map((x) => x.name)).toEqual(['B', 'A'])
  })
})
