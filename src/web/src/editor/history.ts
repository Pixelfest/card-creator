import { sameContent, type Card } from './model'

// Undo and redo (docs/spec.md, section 8): one history per Set editor, each committed change
// one step, the last 100 kept in memory. A step remembers the Cards before and after; undoing
// replays only that step's own difference onto the current Cards, so changes that arrived
// from elsewhere since (tab-focus refresh) are left alone.

export const HISTORY_LIMIT = 100

export type Step = { cardId: string | null; before: Card[]; after: Card[] }

export type History = { past: Step[]; future: Step[] }

export const emptyHistory: History = { past: [], future: [] }

/** Adds a new step; anything that could have been redone is gone. */
export function record(history: History, step: Step, limit = HISTORY_LIMIT): History {
  return { past: [...history.past, step].slice(-limit), future: [] }
}

export type Travel = { history: History; cards: Card[]; select: string | null }

export function undo(history: History, current: Card[]): Travel | null {
  const step = history.past.at(-1)
  if (!step) return null
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, step] },
    cards: applyDifference(current, step.after, step.before),
    select: step.cardId,
  }
}

export function redo(history: History, current: Card[]): Travel | null {
  const step = history.future.at(-1)
  if (!step) return null
  return {
    history: { past: [...history.past, step], future: history.future.slice(0, -1) },
    cards: applyDifference(current, step.before, step.after),
    select: step.cardId,
  }
}

/**
 * Applies the change that turned `from` into `to` onto `current`: Cards removed, Cards added
 * (at their place in `to`), Card contents changed, and a changed order.
 */
export function applyDifference(current: readonly Card[], from: readonly Card[], to: readonly Card[]): Card[] {
  const fromById = new Map(from.map((c) => [c.id, c]))
  const toById = new Map(to.map((c) => [c.id, c]))

  // Removed, and changed contents.
  let result = current
    .filter((c) => !(fromById.has(c.id) && !toById.has(c.id)))
    .map((c) => {
      const before = fromById.get(c.id)
      const after = toById.get(c.id)
      return before && after && !sameContent(before, after) ? after : c
    })

  // Added: after the closest Card that precedes it in `to` and is still here.
  for (const [index, card] of to.entries()) {
    if (fromById.has(card.id) || result.some((c) => c.id === card.id)) continue
    let at = 0
    for (let i = index - 1; i >= 0; i--) {
      const found = result.findIndex((c) => c.id === to[i].id)
      if (found >= 0) {
        at = found + 1
        break
      }
    }
    result = [...result.slice(0, at), card, ...result.slice(at)]
  }

  // A changed order: put the Cards the step knew about in `to`'s order, in the slots they
  // occupy now; Cards that arrived from elsewhere keep their places.
  const common = (list: readonly Card[]) => list.map((c) => c.id).filter((id) => fromById.has(id) && toById.has(id))
  const fromOrder = common(from)
  const toOrder = common(to)
  if (fromOrder.some((id, i) => toOrder[i] !== id)) {
    const known = new Set(toOrder)
    const slots = result.map((c, i) => (known.has(c.id) ? i : -1)).filter((i) => i >= 0)
    const byId = new Map(result.map((c) => [c.id, c]))
    const ordered = toOrder.filter((id) => byId.has(id))
    const next = [...result]
    slots.forEach((slot, i) => {
      if (ordered[i]) next[slot] = byId.get(ordered[i])!
    })
    result = next
  }

  return result
}
