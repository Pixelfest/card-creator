import { duplicateCard, move, newCard, type Card, type CardContent, type Snippet, type SnippetSlot } from './model'
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

/** Puts a snippet in a slot, or empties the slot (null). */
export function setSnippet(cardId: string, slot: SnippetSlot, snippet: Snippet | null): EditorChange {
  return {
    cardId,
    apply: (cards) =>
      cards.map((c) => {
        if (c.id !== cardId) return c
        const snippets = { ...c.design.snippets }
        if (snippet) snippets[slot] = snippet
        else delete snippets[slot]
        return { ...c, design: { ...c.design, snippets } }
      }),
  }
}

/** Changes some fields of the snippet in a slot (nothing if the slot is empty). */
export function patchSnippet(cardId: string, slot: SnippetSlot, patch: Partial<Snippet>): EditorChange {
  return {
    cardId,
    apply: (cards) =>
      cards.map((c) => {
        const current = c.id === cardId ? c.design.snippets[slot] : undefined
        if (!current) return c
        return { ...c, design: { ...c.design, snippets: { ...c.design.snippets, [slot]: { ...current, ...patch } } } }
      }),
  }
}
