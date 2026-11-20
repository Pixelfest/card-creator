import { describe, expect, it, vi } from 'vitest'
import * as actions from './actions'
import { backoff } from './saver'
import { createEditor } from './store'
import { card, FakeCardsApi, serverCard } from './testing'

function setup(names: string[] = ['A', 'B']) {
  const cards = names.map((n) => card(n))
  const api = new FakeCardsApi(cards.map((c) => serverCard(c)))
  const sleeps: number[] = []
  const editor = createEditor({
    api,
    initial: api.cards.map((c) => ({ ...c })),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
  })
  const state = () => editor.store.getState()
  const idle = () => vi.waitFor(() => expect(editor.saver.dirty).toBe(false))
  return { api, editor, cards, state, sleeps, idle }
}

describe('backoff', () => {
  it('doubles from 1 s up to 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoff)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
  })
})

describe('the save queue', () => {
  it('saves a committed change and reports Saving… then All changes saved', async () => {
    const { api, editor, cards, state, idle } = setup()
    const statuses: string[] = []
    editor.store.subscribe((s) => statuses.push(s.status))

    state().commit(actions.update(cards[0].id, { name: 'Dragon' }))
    await idle()

    expect(api.names()).toEqual(['Dragon', 'B'])
    expect(statuses).toContain('saving')
    expect(state().status).toBe('saved')
  })

  it('coalesces edits made while a save is in flight into one more save', async () => {
    const { api, cards, state, idle } = setup()
    let release!: () => void
    api.gate = new Promise((resolve) => (release = resolve))

    state().commit(actions.update(cards[0].id, { name: 'One' }))
    state().commit(actions.update(cards[0].id, { name: 'Two' }))
    state().commit(actions.update(cards[0].id, { name: 'Three' }))
    api.gate = null
    release()
    await idle()

    expect(api.calls).toEqual(['save One', 'save Three'])
    expect(api.names()[0]).toBe('Three')
  })

  it('retries with backoff and keeps the change in memory', async () => {
    const { api, cards, state, sleeps, idle } = setup()
    api.failNext = 3

    state().commit(actions.update(cards[0].id, { copies: 4 }))
    await idle()

    expect(sleeps).toEqual([1000, 2000, 4000])
    expect(api.contentOf(cards[0].id).copies).toBe(4)
    expect(state().status).toBe('saved')
  })

  it('shows Couldn’t save, retrying while requests fail', async () => {
    const { api, editor, cards, state } = setup()
    api.failNext = 1
    const statuses: string[] = []
    editor.store.subscribe((s) => statuses.push(s.status))

    state().commit(actions.update(cards[0].id, { copies: 2 }))
    await vi.waitFor(() => expect(state().status).toBe('saved'))

    expect(statuses).toContain('retrying')
  })

  it('adds, duplicates, reorders and deletes through the same path', async () => {
    const { api, cards, state, idle } = setup(['A'])

    state().commit(actions.addCard(state().cards, 'frames/44x72/gold-border.png'))
    state().commit(actions.duplicate(cards[0].id))
    await idle()
    expect(api.names()).toEqual(['A', 'A (copy)', 'Card 2'])

    state().commit(actions.reorder(state().cards[2].id, 0))
    state().commit(actions.remove(cards[0].id))
    await idle()
    expect(api.names()).toEqual(['Card 2', 'A (copy)'])
    expect(state().cards.map((c) => c.name)).toEqual(['Card 2', 'A (copy)'])
  })

  it('adding a Card that is deleted before it is saved sends nothing', async () => {
    const { api, state, idle } = setup(['A'])
    let release!: () => void
    api.gate = new Promise((resolve) => (release = resolve))
    state().commit(actions.update(state().cards[0].id, { name: 'A1' })) // holds the queue

    state().commit(actions.addCard(state().cards, null))
    state().commit(actions.remove(state().cards[1].id))
    api.gate = null
    release()
    await idle()

    expect(api.calls).toEqual(['save A1'])
  })

  it('a stale version opens the conflict; "load their version" takes theirs', async () => {
    const { api, cards, state, idle } = setup()
    api.editElsewhere(cards[0].id, { name: 'Theirs' })

    state().commit(actions.update(cards[0].id, { name: 'Mine' }))
    await vi.waitFor(() => expect(state().conflict?.cardId).toBe(cards[0].id))
    expect(state().status).toBe('conflict')

    state().resolveConflict('theirs')
    await idle()

    expect(state().cards[0].name).toBe('Theirs')
    expect(api.names()[0]).toBe('Theirs')
    expect(state().conflict).toBeNull()
  })

  it('"keep mine" overwrites their version', async () => {
    const { api, cards, state, idle } = setup()
    api.editElsewhere(cards[0].id, { name: 'Theirs' })
    state().commit(actions.update(cards[0].id, { name: 'Mine' }))
    await vi.waitFor(() => expect(state().conflict).not.toBeNull())

    state().resolveConflict('mine')
    await idle()

    expect(api.names()[0]).toBe('Mine')
    expect(state().status).toBe('saved')
  })

  it('other Cards keep saving while one waits on a conflict', async () => {
    const { api, cards, state } = setup()
    api.editElsewhere(cards[0].id, { name: 'Theirs' })

    state().commit(actions.update(cards[0].id, { name: 'Mine' }))
    state().commit(actions.update(cards[1].id, { name: 'B2' }))

    await vi.waitFor(() => expect(api.names()[1]).toBe('B2'))
    expect(state().conflict?.cardId).toBe(cards[0].id)
  })

  it('a Card deleted elsewhere while edited here is created again', async () => {
    const { api, cards, state, idle } = setup()
    api.cards = api.cards.filter((c) => c.id !== cards[0].id)

    state().commit(actions.update(cards[0].id, { name: 'Still mine' }))
    await idle()

    expect(api.names()).toContain('Still mine')
  })

  it('a refresh picks up a Card renamed elsewhere', async () => {
    const { api, editor, cards, state, idle } = setup()
    api.editElsewhere(cards[1].id, { name: 'Renamed elsewhere' })

    editor.saver.refresh()
    await idle()

    expect(state().cards[1].name).toBe('Renamed elsewhere')
  })

  it('flush sends everything unsaved without waiting', () => {
    const { api, editor, cards, state } = setup()
    let release!: () => void
    api.gate = new Promise((resolve) => (release = resolve))
    state().commit(actions.update(cards[0].id, { name: 'A1' })) // in flight, held
    state().commit(actions.update(cards[1].id, { name: 'B1' }))

    editor.saver.flush()

    expect(api.calls).toContain('save B1')
    release()
  })
})
