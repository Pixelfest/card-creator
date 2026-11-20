import { createStore, type StoreApi } from 'zustand/vanilla'
import type { CardsApi } from './cardsApi'
import { deepEqual, type Card, type ServerCard } from './model'
import { Saver, type Conflict, type SaveStatus } from './saver'

/** One finished edit: a function from the Cards before to the Cards after. */
export type EditorChange = {
  /** The Card the change is about (selected again when it is undone or redone). */
  cardId: string | null
  apply: (cards: Card[]) => Card[]
  /** What to select afterwards; defaults to `cardId`. */
  select?: string | null
}

/** What every committed change reports, for undo/redo (#21). */
export type CommittedChange = { cardId: string | null; before: Card[]; after: Card[] }

export type EditorState = {
  cards: Card[]
  selectedId: string | null
  status: SaveStatus
  conflict: Conflict | null
  /** The one way to change Cards: applies the change, then saves it. */
  commit: (change: EditorChange) => void
  /** Replaces all Cards (undo/redo) without recording a new change; still saved. */
  restore: (cards: Card[], select: string | null) => void
  select: (cardId: string | null) => void
  resolveConflict: (choice: 'theirs' | 'mine') => void
}

export type Editor = {
  store: StoreApi<EditorState>
  saver: Saver
  /** Called after every committed change. Returns an unsubscribe function. */
  onCommit: (listener: (change: CommittedChange) => void) => () => void
}

function stillThere(cards: Card[], id: string | null | undefined): string | null {
  return id && cards.some((c) => c.id === id) ? id : null
}

export function createEditor({
  api,
  initial,
  sleep,
}: {
  api: CardsApi
  initial: ServerCard[]
  sleep?: (ms: number) => Promise<void>
}): Editor {
  const listeners = new Set<(change: CommittedChange) => void>()
  // Assigned right below; the store's actions only run after that.
  let saver!: Saver

  const store = createStore<EditorState>()((set, get) => ({
    cards: initial.map(({ id, name, copies, design }) => ({ id, name, copies, design })),
    selectedId: initial[0]?.id ?? null,
    status: 'saved',
    conflict: null,

    commit: (change) => {
      const { cardId } = change
      const before = get().cards
      const after = change.apply(before)
      if (deepEqual(before, after)) return
      // Read after apply: some changes only know what to select once they have run.
      const selected = change.select === undefined ? cardId : change.select
      set({ cards: after, selectedId: stillThere(after, selected) ?? stillThere(after, get().selectedId) })
      for (const listener of listeners) listener({ cardId, before, after })
      saver.schedule()
    },

    restore: (cards, select) => {
      set({ cards, selectedId: stillThere(cards, select) ?? stillThere(cards, get().selectedId) ?? cards[0]?.id ?? null })
      saver.schedule()
    },

    select: (cardId) => set({ selectedId: stillThere(get().cards, cardId) }),

    resolveConflict: (choice) => {
      const conflict = get().conflict
      if (conflict) saver.resolve(conflict.cardId, choice)
    },
  }))

  saver = new Saver({
    api,
    initial,
    sleep,
    getLocal: () => store.getState().cards,
    setLocal: (cards) => {
      const { selectedId } = store.getState()
      store.setState({ cards, selectedId: stillThere(cards, selectedId) ?? cards[0]?.id ?? null })
    },
    onStatus: (status) => store.setState({ status }),
    onConflict: (conflict) => store.setState({ conflict }),
  })

  return {
    store,
    saver,
    onCommit: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
