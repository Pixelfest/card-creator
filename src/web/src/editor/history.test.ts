import { describe, expect, it } from 'vitest'
import * as actions from './actions'
import { applyDifference, emptyHistory, record, redo, undo, type History } from './history'
import type { Card } from './model'
import { card } from './testing'

const names = (cards: Card[]) => cards.map((c) => c.name)

/** Runs a change like the store does and records it. */
function commit(history: History, cards: Card[], change: ReturnType<typeof actions.update>) {
  const after = change.apply(cards)
  return { history: record(history, { cardId: change.cardId, before: cards, after }), cards: after }
}

describe('history', () => {
  it('undoes and redoes a change', () => {
    const a = card('A')
    let { history, cards } = commit(emptyHistory, [a], actions.update(a.id, { name: 'A2' }))

    const back = undo(history, cards)!
    expect(names(back.cards)).toEqual(['A'])
    expect(back.select).toBe(a.id)

    const forward = redo(back.history, back.cards)!
    expect(names(forward.cards)).toEqual(['A2'])
    ;({ history, cards } = forward)
    expect(history.future).toHaveLength(0)
  })

  it('keeps only the last 100 steps', () => {
    const a = card('A')
    let state = { history: emptyHistory, cards: [a] }
    for (let i = 1; i <= 120; i++) state = commit(state.history, state.cards, actions.update(a.id, { copies: i }))

    expect(state.history.past).toHaveLength(100)
    let cards = state.cards
    let history = state.history
    for (;;) {
      const back = undo(history, cards)
      if (!back) break
      ;({ history, cards } = back)
    }
    expect(cards[0].copies).toBe(20) // steps 1–20 fell off the end
  })

  it('a new change clears redo', () => {
    const a = card('A')
    let state = commit(emptyHistory, [a], actions.update(a.id, { name: 'A2' }))
    const back = undo(state.history, state.cards)!
    expect(back.history.future).toHaveLength(1)

    state = commit(back.history, back.cards, actions.update(a.id, { name: 'A3' }))

    expect(state.history.future).toHaveLength(0)
    expect(redo(state.history, state.cards)).toBeNull()
  })

  it('restores a deleted Card at its position, and redo deletes it again', () => {
    const [a, b, c] = [card('A'), card('B'), card('C')]
    const state = commit(emptyHistory, [a, b, c], actions.remove(b.id))
    expect(names(state.cards)).toEqual(['A', 'C'])

    const back = undo(state.history, state.cards)!
    expect(back.cards).toEqual([a, b, c])
    expect(back.select).toBe(b.id)

    expect(names(redo(back.history, back.cards)!.cards)).toEqual(['A', 'C'])
  })

  it('undoes add, duplicate and reorder', () => {
    const [a, b] = [card('A'), card('B')]
    let state = commit(emptyHistory, [a, b], actions.addCard([a, b], null))
    state = commit(state.history, state.cards, actions.duplicate(a.id))
    const beforeReorder = state.cards
    state = commit(state.history, state.cards, actions.reorder(b.id, 0))
    expect(names(state.cards)).toEqual(['B', 'A', 'A (copy)', 'Card 3'])

    let back = undo(state.history, state.cards)!
    expect(names(back.cards)).toEqual(['A', 'A (copy)', 'B', 'Card 3'])
    back = undo(back.history, back.cards)!
    expect(names(back.cards)).toEqual(['A', 'B', 'Card 3'])
    back = undo(back.history, back.cards)!
    expect(names(back.cards)).toEqual(['A', 'B'])
    expect(undo(back.history, back.cards)).toBeNull()

    // Redo recreates the same Cards (same ids), not new ones.
    const once = redo(back.history, back.cards)!
    const twice = redo(once.history, once.cards)!
    expect(twice.cards).toEqual(beforeReorder)
  })
})

describe('applyDifference', () => {
  it('leaves alone a change that arrived from elsewhere after the step', () => {
    const [a, b] = [card('A'), card('B')]
    const step = { before: [a, b], after: [{ ...a, name: 'Mine' }, b] }
    const current = [{ ...a, name: 'Mine' }, { ...b, name: 'Theirs' }]

    expect(names(applyDifference(current, step.after, step.before))).toEqual(['A', 'Theirs'])
  })

  it('reinserts after the closest preceding Card that is still there', () => {
    const [a, b, c, d] = [card('A'), card('B'), card('C'), card('D')]
    // The step deleted C; since then B was deleted elsewhere.
    const restored = applyDifference([a, d], [a, b, d], [a, b, c, d])

    expect(names(restored)).toEqual(['A', 'C', 'D'])
  })

  it('reverts an order change without moving Cards the step did not know about', () => {
    const [a, b, x] = [card('A'), card('B'), card('X')]
    // The step moved B before A; X arrived from elsewhere at the end.
    const reverted = applyDifference([b, a, x], [b, a], [a, b])

    expect(names(reverted)).toEqual(['A', 'B', 'X'])
  })
})
