import type { CardsApi, SaveResult } from './cardsApi'
import { contentOf, type Card, type CardContent, type ServerCard } from './model'

let counter = 0

export function card(name: string, overrides: Partial<Card> = {}): Card {
  counter++
  return {
    id: `card${String(counter).padStart(18, '0')}`,
    name,
    copies: 1,
    design: { fill: '#ffffff', frame: null, artwork: null, snippets: {} },
    ...overrides,
  }
}

export function serverCard(c: Card, version = 1, position = 0): ServerCard {
  return { ...c, setId: 'set', position, version, updatedAt: '2026-11-20T10:00:00Z' }
}

/** An in-memory server with the real API's rules, plus switches to make calls fail. */
export class FakeCardsApi implements CardsApi {
  cards: ServerCard[]
  calls: string[] = []
  /** Calls that fail with a network error before reaching the "server". */
  failNext = 0
  /** Lets a test pause a call until it chooses to let it continue. */
  gate: Promise<void> | null = null

  constructor(initial: ServerCard[] = []) {
    this.cards = initial.map((c, i) => ({ ...c, position: i }))
  }

  private async enter(call: string) {
    this.calls.push(call)
    if (this.gate) await this.gate
    if (this.failNext > 0) {
      this.failNext--
      throw new TypeError('Failed to fetch')
    }
  }

  async list() {
    await this.enter('list')
    return this.cards.map((c, i) => ({ ...c, position: i }))
  }

  async create(c: Card, position: number) {
    await this.enter(`create ${c.name}`)
    if (this.cards.some((x) => x.id === c.id)) return 'exists' as const
    this.cards.splice(Math.min(position, this.cards.length), 0, serverCard(c, 1))
    return 'created' as const
  }

  async save(id: string, content: CardContent, version: number): Promise<SaveResult> {
    await this.enter(`save ${content.name}`)
    const index = this.cards.findIndex((c) => c.id === id)
    if (index < 0) return { kind: 'notFound' }
    const current = this.cards[index]
    if (current.version !== version) return { kind: 'conflict', card: current }
    const saved = { ...current, ...content, version: version + 1 }
    this.cards[index] = saved
    return { kind: 'saved', card: saved }
  }

  async remove(id: string) {
    await this.enter(`delete ${id}`)
    this.cards = this.cards.filter((c) => c.id !== id)
  }

  async reorder(ids: string[]) {
    await this.enter('reorder')
    this.cards = ids.map((id) => this.cards.find((c) => c.id === id)!)
  }

  /** Another browser saving a Card. */
  editElsewhere(id: string, patch: Partial<CardContent>) {
    const index = this.cards.findIndex((c) => c.id === id)
    const current = this.cards[index]
    this.cards[index] = { ...current, ...patch, version: current.version + 1 }
  }

  names() {
    return this.cards.map((c) => c.name)
  }

  contentOf(id: string) {
    return contentOf(this.cards.find((c) => c.id === id)!)
  }
}
