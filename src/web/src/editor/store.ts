import { createStore, type StoreApi } from 'zustand/vanilla'
import type { CardsApi } from './cardsApi'
import { emptyHistory, record, redo, undo, type History } from './history'
import type { CardPart } from '../render/warnings'
import { deepEqual, type Card, type CardDesign, type ServerCard } from './model'
import { Saver, type Conflict, type SaveStatus } from './saver'

/** One finished edit: a function from the Cards before to the Cards after. */
export type EditorChange = {
  /** The Card the change is about (selected again when it is undone or redone). */
  cardId: string | null
  apply: (cards: Card[]) => Card[]
  /** What to select afterwards; defaults to `cardId`. */
  select?: string | null
}

/** What every committed change reports to `onCommit` listeners. */
export type CommittedChange = { cardId: string | null; before: Card[]; after: Card[] }

export type EditorState = {
  cards: Card[]
  selectedId: string | null
  status: SaveStatus
  conflict: Conflict | null
  /** Undo/redo for this editor only: cleared on reload or when switching Set. */
  history: History
  /** Which part's properties the right-hand panel shows. */
  part: CardPart
  /**
   * A change being made but not finished yet (a colour picker still open, a slider or drag
   * still held): shown on the canvas, not saved and not in history until committed.
   */
  preview: { cardId: string; design: Partial<CardDesign> } | null
  /** The one way to change Cards: applies the change, records it for undo, then saves it. */
  commit: (change: EditorChange) => void
  /** Replaces all Cards without recording a new change (undo/redo); still saved. */
  restore: (cards: Card[], select: string | null) => void
  select: (cardId: string | null) => void
  undo: () => void
  redo: () => void
  selectPart: (part: CardPart) => void
  setPreview: (preview: EditorState['preview']) => void
  resolveConflict: (choice: 'theirs' | 'mine') => void
}

export type Editor = {
  collectionId: string
  setId: string
  store: StoreApi<EditorState>
  saver: Saver
  /** Called after every committed change. Returns an unsubscribe function. */
  onCommit: (listener: (change: CommittedChange) => void) => () => void
}

function stillThere(cards: Card[], id: string | null | undefined): string | null {
  return id && cards.some((c) => c.id === id) ? id : null
}

export function createEditor({
  collectionId = '',
  setId = '',
  api,
  initial,
  sleep,
}: {
  collectionId?: string
  setId?: string
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
    history: emptyHistory,
    part: 'card',
    preview: null,

    commit: (change) => {
      const { cardId } = change
      const before = get().cards
      const after = change.apply(before)
      if (deepEqual(before, after)) return
      // Read after apply: some changes only know what to select once they have run.
      const selected = change.select === undefined ? cardId : change.select
      set({
        cards: after,
        selectedId: stillThere(after, selected) ?? stillThere(after, get().selectedId),
        history: record(get().history, { cardId, before, after }),
        preview: null,
      })
      for (const listener of listeners) listener({ cardId, before, after })
      saver.schedule()
    },

    restore: (cards, select) => {
      set({ cards, selectedId: stillThere(cards, select) ?? stillThere(cards, get().selectedId) ?? cards[0]?.id ?? null })
      saver.schedule()
    },

    select: (cardId) => set({ selectedId: stillThere(get().cards, cardId), preview: null }),

    selectPart: (part) => set({ part }),

    setPreview: (preview) => set({ preview }),

    // Undo and redo select the affected Card and save the result like any other change.
    undo: () => {
      const travel = undo(get().history, get().cards)
      if (!travel) return
      set({ history: travel.history })
      get().restore(travel.cards, travel.select)
    },

    redo: () => {
      const travel = redo(get().history, get().cards)
      if (!travel) return
      set({ history: travel.history })
      get().restore(travel.cards, travel.select)
    },

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
    collectionId,
    setId,
    store,
    saver,
    onCommit: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
