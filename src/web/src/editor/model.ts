// The Card model as the editor holds it. `design` is stored by the server as opaque jsonb;
// later slices add Artwork (#23) and Text snippets (#25) to it.

export type CardDesign = {
  /** Fill colour behind everything, e.g. "#ffffff". */
  fill: string
  /** Asset path of the Frame (e.g. "frames/44x72/gold-border.png"), or null. */
  frame: string | null
  artwork: unknown
  snippets: Record<string, unknown>
}

export type CardContent = { name: string; copies: number; design: CardDesign }

export type Card = CardContent & { id: string }

/** A Card as the server returns it. */
export type ServerCard = Card & { setId: string; position: number; version: number; updatedAt: string }

export const MAX_COPIES = 999

export function contentOf(card: CardContent): CardContent {
  return { name: card.name, copies: card.copies, design: card.design }
}

/** Deep equality for JSON-like values, ignoring object key order (jsonb reorders keys). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => deepEqual(value, b[i]))
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every(
    (key) => Object.hasOwn(b, key) && deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}

export function sameContent(a: CardContent, b: CardContent): boolean {
  return a.name === b.name && a.copies === b.copies && deepEqual(a.design, b.design)
}

/** "Card N": one more than the number of Cards, skipping names already in use. */
export function nextCardName(cards: readonly Card[]): string {
  const used = new Set(cards.map((c) => c.name))
  let n = cards.length + 1
  while (used.has(`Card ${n}`)) n++
  return `Card ${n}`
}

/** Base62 like the server's ids, so a new Card has its final id before it is saved. */
export function newCardId(): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  let id = ''
  for (let i = 0; i < 22; i++) {
    id = alphabet[Number(value % 62n)] + id
    value /= 62n
  }
  return id
}

/** Spec section 4: "Card N", 1 copy, white fill, the first available Frame, nothing else. */
export function newCard(cards: readonly Card[], firstFrame: string | null): Card {
  return {
    id: newCardId(),
    name: nextCardName(cards),
    copies: 1,
    design: { fill: '#ffffff', frame: firstFrame, artwork: null, snippets: {} },
  }
}

/** Copies everything, including the Artwork reference (the file is shared), plus " (copy)". */
export function duplicateCard(card: Card): Card {
  const suffix = ' (copy)'
  const base = card.name.length + suffix.length > 200 ? card.name.slice(0, 200 - suffix.length).trimEnd() : card.name
  return { ...structuredClone(contentOf(card)), id: newCardId(), name: base + suffix }
}

/** Moves the item at `from` so that it ends up at index `to`. */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}
