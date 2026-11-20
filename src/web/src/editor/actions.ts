import { duplicateCard, move, newCard, type Card, type CardContent } from './model'
import type { EditorChange } from './store'

// The card-list and properties edits, each expressed as one EditorChange.

export function addCard(cards: readonly Card[], firstFrame: string | null): EditorChange {
  const card = newCard(cards, firstFrame)
  return { cardId: card.id, apply: (current) => [...current, card] }
}

export function duplicate(cardId: string): EditorChange {
  // One id for the copy, so redoing the change recreates the same Card.
  let copy: Card | undefined
  return {
    cardId,
    apply: (cards) => {
      const index = cards.findIndex((c) => c.id === cardId)
      if (index < 0) return cards
      copy ??= duplicateCard(cards[index])
      return [...cards.slice(0, index + 1), copy, ...cards.slice(index + 1)]
    },
    get select() {
      return copy?.id ?? cardId
    },
  }
}

export function remove(cardId: string): EditorChange {
  let neighbour: string | null = null
  return {
    cardId,
    apply: (cards) => {
      const index = cards.findIndex((c) => c.id === cardId)
      if (index < 0) return cards
      const rest = cards.filter((c) => c.id !== cardId)
      neighbour = rest[Math.min(index, rest.length - 1)]?.id ?? null
      return rest
    },
    get select() {
      return neighbour
    },
  }
}

export function reorder(cardId: string, toIndex: number): EditorChange {
  return {
    cardId,
    apply: (cards) => {
      const from = cards.findIndex((c) => c.id === cardId)
      if (from < 0 || from === toIndex) return cards
      return move(cards, from, Math.max(0, Math.min(toIndex, cards.length - 1)))
    },
  }
}

export function update(cardId: string, patch: Partial<CardContent>): EditorChange {
  return {
    cardId,
    apply: (cards) => cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
  }
}

export function updateDesign(cardId: string, patch: Partial<Card['design']>): EditorChange {
  return {
    cardId,
    apply: (cards) => cards.map((c) => (c.id === cardId ? { ...c, design: { ...c.design, ...patch } } : c)),
  }
}
