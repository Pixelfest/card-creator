import type { CardsApi } from './cardsApi'
import { contentOf, type Card, type ServerCard } from './model'
import { applyToMirror, mergeRemote, planNext, type ServerMirror, type SyncOp } from './sync'

export type SaveStatus = 'saved' | 'saving' | 'retrying' | 'conflict'

export type Conflict = { cardId: string; theirs: ServerCard }

type SaverOptions = {
  api: CardsApi
  initial: ServerCard[]
  /** The editor's current Cards, in order. */
  getLocal: () => Card[]
  /** Replaces the editor's Cards with ones that came from the server (not an undoable edit). */
  setLocal: (cards: Card[]) => void
  onStatus: (status: SaveStatus) => void
  onConflict: (conflict: Conflict | null) => void
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>
}

/** 1 s, 2 s, 4 s … capped at 30 s. */
export function backoff(failures: number): number {
  return Math.min(1000 * 2 ** (failures - 1), 30_000)
}

/**
 * Keeps the server in step with the editor (docs/spec.md, section 8). Call `schedule()` after
 * every committed change; it sends one request at a time until nothing differs. Failed
 * requests retry with backoff while the changes stay in memory.
 */
export class Saver {
  private readonly api: CardsApi
  private readonly options: SaverOptions
  private readonly sleep: (ms: number) => Promise<void>
  private server: ServerMirror
  private readonly blocked = new Set<string>()
  private conflicts: Conflict[] = []
  private running = false
  private failures = 0
  private refreshQueued = false
  private disposed = false

  constructor(options: SaverOptions) {
    this.options = options
    this.api = options.api
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.server = {
      cards: new Map(options.initial.map((c) => [c.id, { version: c.version, content: contentOf(c) }])),
      order: options.initial.map((c) => c.id),
    }
  }

  /** True while anything is unsaved, in flight or waiting on a conflict choice. */
  get dirty(): boolean {
    return this.running || this.blocked.size > 0 || planNext(this.options.getLocal(), this.server) !== null
  }

  schedule(): void {
    if (this.running || this.disposed) return
    void this.run()
  }

  private async run(): Promise<void> {
    this.running = true
    try {
      for (;;) {
        if (this.disposed) return
        if (this.refreshQueued) {
          this.refreshQueued = false
          await this.refreshNow()
        }
        const op = planNext(this.options.getLocal(), this.server, this.blocked)
        if (!op) break
        this.options.onStatus('saving')
        try {
          await this.execute(op)
          this.failures = 0
        } catch {
          this.failures++
          this.options.onStatus('retrying')
          await this.sleep(backoff(this.failures))
        }
      }
    } finally {
      this.running = false
    }
    this.options.onStatus(this.blocked.size > 0 ? 'conflict' : 'saved')
  }

  private async execute(op: SyncOp, keepalive = false): Promise<void> {
    switch (op.kind) {
      case 'delete':
        await this.api.remove(op.id, keepalive)
        applyToMirror(this.server, op)
        return
      case 'create': {
        const result = await this.api.create(op.card, op.position, keepalive)
        if (result === 'exists') {
          // An earlier attempt landed; learn its real state from the server.
          await this.refreshNow()
          return
        }
        applyToMirror(this.server, op)
        return
      }
      case 'save': {
        const result = await this.api.save(op.id, op.content, op.version, keepalive)
        if (result.kind === 'saved') {
          applyToMirror(this.server, op, result.card.version)
        } else if (result.kind === 'conflict') {
          this.blocked.add(op.id)
          this.conflicts.push({ cardId: op.id, theirs: result.card })
          this.publishConflict()
        } else {
          // Deleted elsewhere: forget it on the server side so it is created again (keep mine).
          applyToMirror(this.server, { kind: 'delete', id: op.id })
        }
        return
      }
      case 'reorder':
        await this.api.reorder(op.order, keepalive)
        applyToMirror(this.server, op)
        return
    }
  }

  private publishConflict(): void {
    this.options.onConflict(this.conflicts[0] ?? null)
  }

  /** The user's answer to the conflict dialog for one Card. */
  resolve(cardId: string, choice: 'theirs' | 'mine'): void {
    const conflict = this.conflicts.find((c) => c.cardId === cardId)
    if (!conflict) return
    const { theirs } = conflict
    this.conflicts = this.conflicts.filter((c) => c !== conflict)
    this.blocked.delete(cardId)
    // Either way the server now holds their version.
    this.server.cards.set(cardId, { version: theirs.version, content: contentOf(theirs) })
    if (choice === 'theirs') {
      this.options.setLocal(
        this.options.getLocal().map((card) => (card.id === cardId ? { id: cardId, ...contentOf(theirs) } : card)),
      )
    }
    // "Keep mine": the next comparison saves my content against their version.
    this.publishConflict()
    this.schedule()
  }

  /** Re-fetches the Set's Cards (on tab focus) and folds in changes made elsewhere. */
  refresh(): void {
    this.refreshQueued = true
    this.schedule()
  }

  private async refreshNow(): Promise<void> {
    const remote = await this.api.list()
    const merged = mergeRemote(this.options.getLocal(), this.server, remote)
    this.server = merged.server
    this.options.setLocal(merged.local)
  }

  /**
   * Page leave: send everything still unsaved without waiting for answers, as keepalive
   * requests that outlive the page.
   */
  flush(): void {
    if (this.disposed) return
    const local = this.options.getLocal()
    for (let guard = 0; guard < 1000; guard++) {
      const op = planNext(local, this.server, this.blocked)
      if (!op) return
      void this.execute(op, true).catch(() => {})
      // Assume success so the next comparison moves on.
      applyToMirror(this.server, op, op.kind === 'save' ? op.version + 1 : undefined)
    }
  }

  dispose(): void {
    this.disposed = true
  }
}
