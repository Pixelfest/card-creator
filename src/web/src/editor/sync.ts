import { contentOf, sameContent, type Card, type CardContent } from './model'

// Saving works by comparing what the editor holds with what the server is known to hold,
// and sending one request at a time until they match. Edits made while a request is in
// flight simply show up in the next comparison, so rapid edits coalesce and a retry is
// just "compare again".

export type ServerMirror = {
  cards: Map<string, { version: number; content: CardContent }>
  order: string[]
}

export type SyncOp =
  | { kind: 'delete'; id: string }
  | { kind: 'create'; card: Card; position: number }
  | { kind: 'save'; id: string; content: CardContent; version: number }
  | { kind: 'reorder'; order: string[] }

export function mirrorOf(cards: readonly (Card & { version: number })[]): ServerMirror {
  return {
    cards: new Map(cards.map((c) => [c.id, { version: c.version, content: contentOf(c) }])),
    order: cards.map((c) => c.id),
  }
}

/**
 * The next request that brings the server closer to `local`, or null when they match.
 * Cards in `blocked` (waiting on a conflict choice) are not saved.
 */
export function planNext(local: readonly Card[], server: ServerMirror, blocked: ReadonlySet<string> = new Set()): SyncOp | null {
  const localIds = new Set(local.map((c) => c.id))

  for (const id of server.order) {
    if (!localIds.has(id)) return { kind: 'delete', id }
  }

  for (const [index, card] of local.entries()) {
    if (!server.cards.has(card.id)) return { kind: 'create', card, position: index }
  }

  for (const card of local) {
    const known = server.cards.get(card.id)!
    if (!blocked.has(card.id) && !sameContent(card, known.content)) {
      return { kind: 'save', id: card.id, content: contentOf(card), version: known.version }
    }
  }

  const order = local.map((c) => c.id)
  if (order.some((id, i) => server.order[i] !== id)) return { kind: 'reorder', order }

  return null
}

/** Records in the mirror that `op` succeeded. */
export function applyToMirror(server: ServerMirror, op: SyncOp, savedVersion?: number): void {
  switch (op.kind) {
    case 'delete':
      server.cards.delete(op.id)
      server.order = server.order.filter((id) => id !== op.id)
      break
    case 'create': {
      server.cards.set(op.card.id, { version: 1, content: contentOf(op.card) })
      const order = server.order.filter((id) => id !== op.card.id)
      order.splice(Math.min(op.position, order.length), 0, op.card.id)
      server.order = order
      break
    }
    case 'save':
      server.cards.set(op.id, { version: savedVersion ?? 0, content: op.content })
      break
    case 'reorder':
      server.order = [...op.order]
      break
  }
}

/**
 * Folds a fresh server listing into the editor (re-fetch on tab focus). Cards with unsaved
 * local edits keep them (a stale version later surfaces as a conflict); everything else
 * follows the server, including Cards added or deleted elsewhere.
 */
export function mergeRemote(
  local: readonly Card[],
  server: ServerMirror,
  remote: readonly (Card & { version: number })[],
): { local: Card[]; server: ServerMirror } {
  const remoteById = new Map(remote.map((c) => [c.id, c]))
  const isDirty = (card: Card) => {
    const known = server.cards.get(card.id)
    return !known || !sameContent(card, known.content)
  }
  const nextServer: ServerMirror = { cards: new Map(server.cards), order: [...server.order] }
  const localIds = new Set(local.map((c) => c.id))

  let next: Card[] = []
  for (const card of local) {
    const theirs = remoteById.get(card.id)
    if (isDirty(card)) {
      if (!theirs && server.cards.has(card.id)) {
        // Deleted elsewhere while edited here: keep mine; it will be created again.
        nextServer.cards.delete(card.id)
        nextServer.order = nextServer.order.filter((id) => id !== card.id)
      }
      next.push(card)
    } else if (theirs) {
      next.push({ id: theirs.id, ...contentOf(theirs) })
      nextServer.cards.set(theirs.id, { version: theirs.version, content: contentOf(theirs) })
    } else {
      // Deleted elsewhere and untouched here.
      nextServer.cards.delete(card.id)
      nextServer.order = nextServer.order.filter((id) => id !== card.id)
    }
  }

  // Cards added elsewhere (and not ones deleted here but still pending on the server).
  for (const [index, theirs] of remote.entries()) {
    if (!localIds.has(theirs.id) && !server.cards.has(theirs.id)) {
      next.splice(Math.min(index, next.length), 0, { id: theirs.id, ...contentOf(theirs) })
      nextServer.cards.set(theirs.id, { version: theirs.version, content: contentOf(theirs) })
    }
  }

  // Adopt the server's order unless this editor has an unsaved reorder of its own.
  const localOrder = local.map((c) => c.id)
  const orderDirty = localOrder.some((id, i) => server.order[i] !== id) || localOrder.length !== server.order.length
  const remoteOrder = remote.map((c) => c.id)
  if (!orderDirty) {
    const position = new Map(remoteOrder.map((id, i) => [id, i]))
    next = [...next].sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity))
  }
  nextServer.order = remoteOrder.filter((id) => nextServer.cards.has(id))

  return { local: next, server: nextServer }
}
