import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery, stubApi } from '../test/renderWithQuery'
import { SetEditorPage } from './SetEditorPage'

const collectionId = '3f9XkQ2bL0aZ7yT1mN4pRs'
const setId = 'aaaaaaaaaaaaaaaaaaaaaa'
const setUrl = `/api/collections/${collectionId}/sets/${setId}`
const cardsUrl = `${setUrl}/cards`
const collection = { id: collectionId, name: 'Dragon Game', createdAt: '2026-11-19T10:00:00Z' }
const set = {
  id: setId,
  collectionId,
  name: 'Dragon Deck',
  cardFormat: '44x72',
  cardCount: 2,
  createdAt: '2026-11-19T10:00:00Z',
  updatedAt: '2026-11-19T10:00:00Z',
}
const assets = {
  frames: [{ path: 'frames/44x72/gold-border.png', displayName: 'Gold border', url: '/assets/x/gold.png', aspectRatio: 0.61 }],
  fonts: [],
  snippetBackgrounds: [],
  emoji: null,
}
const design = { fill: '#ffffff', frame: 'frames/44x72/gold-border.png', artwork: null, snippets: {} }
const serverCard = (id: string, name: string, position: number, version = 1, copies = 1) => ({
  id,
  setId,
  position,
  name,
  copies,
  design,
  version,
  updatedAt: '2026-11-19T10:00:00Z',
})
const dragon = serverCard('cardaaaaaaaaaaaaaaaaa', 'Dragon', 0)
const knight = serverCard('cardbbbbbbbbbbbbbbbbb', 'Knight', 1, 1, 3)

function stubEditor(extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    [`GET /api/collections/${collectionId}`]: { body: collection },
    [`GET ${setUrl}`]: { body: set },
    [`GET ${cardsUrl}`]: { body: [dragon, knight] },
    'GET /api/assets': { body: assets },
    ...extra,
  })
}

const calls = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method)

describe('SetEditorPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the header, the card list and the selected card’s properties', async () => {
    stubEditor()

    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    expect(await screen.findByLabelText('Set name')).toHaveValue('Dragon Deck')
    expect(await screen.findByRole('link', { name: '← Dragon Game' })).toHaveAttribute('href', `/c/${collectionId}`)
    const list = await screen.findByRole('list', { name: 'Cards' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Dragon'),
      expect.stringContaining('Knight'),
    ])
    expect(within(list).getByLabelText('3 copies')).toHaveTextContent('×3')
    expect(screen.getByLabelText('Card name')).toHaveValue('Dragon')
    expect(screen.getByRole('status')).toHaveTextContent('All changes saved')
    await waitFor(() => expect(document.title).toBe('Dragon Deck'))
  })

  it('selects a card by clicking it', async () => {
    stubEditor()
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Knight' }))

    expect(screen.getByLabelText('Card name')).toHaveValue('Knight')
    expect(screen.getByRole('button', { name: 'Knight' })).toHaveAttribute('aria-current', 'true')
  })

  it('adds "Card 3" with 1 copy, a white fill and the first Frame, and saves it', async () => {
    const fetchMock = stubEditor({ [`POST ${cardsUrl}`]: { status: 201, body: {} } })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    await screen.findByRole('list', { name: 'Cards' })
    await waitFor(() => expect(calls(fetchMock, 'GET').some(([url]) => url === '/api/assets')).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }))

    expect(screen.getByLabelText('Card name')).toHaveValue('Card 3')
    await waitFor(() => expect(calls(fetchMock, 'POST')).toHaveLength(1))
    const body = JSON.parse(String(calls(fetchMock, 'POST')[0][1]?.body))
    expect(body).toMatchObject({ name: 'Card 3', copies: 1, position: 2, design: { fill: '#ffffff', frame: 'frames/44x72/gold-border.png' } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('All changes saved'))
  })

  it('renames a card on blur and changes its Copies, each as a versioned PUT', async () => {
    const fetchMock = stubEditor({
      [`PUT ${cardsUrl}/${dragon.id}`]: (init) => {
        const body = JSON.parse(String(init?.body))
        return { body: { ...dragon, ...body, version: body.version + 1 } }
      },
    })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    const name = await screen.findByLabelText('Card name')

    fireEvent.change(name, { target: { value: 'Red dragon' } })
    fireEvent.blur(name)
    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
    const copies = screen.getByRole('spinbutton', { name: 'Copies' })
    fireEvent.change(copies, { target: { value: '4' } })
    fireEvent.blur(copies)

    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(2))
    const [first, second] = calls(fetchMock, 'PUT').map(([, init]) => JSON.parse(String(init?.body)))
    expect(first).toMatchObject({ name: 'Red dragon', copies: 1, version: 1 })
    expect(second).toMatchObject({ name: 'Red dragon', copies: 4, version: 2 })
    expect(screen.getByRole('button', { name: 'Red dragon' })).toBeInTheDocument()
  })

  it('refuses negative or fractional Copies', async () => {
    const fetchMock = stubEditor()
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    const copies = await screen.findByRole('spinbutton', { name: 'Copies' })

    for (const value of ['-1', '1.5', '']) {
      fireEvent.change(copies, { target: { value } })
      fireEvent.blur(copies)
      expect(copies).toHaveValue(1)
    }
    expect(calls(fetchMock, 'PUT')).toHaveLength(0)
  })

  it('deletes a card only after confirming', async () => {
    const fetchMock = stubEditor({ [`DELETE ${cardsUrl}/${dragon.id}`]: { status: 204 } })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dragon' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Dragon' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Dragon' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete card' }))

    expect(screen.queryByRole('button', { name: 'Dragon' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Card name')).toHaveValue('Knight')
    await waitFor(() => expect(calls(fetchMock, 'DELETE')).toHaveLength(1))
  })

  it('duplicates a card right after it as "(copy)"', async () => {
    const fetchMock = stubEditor({ [`POST ${cardsUrl}`]: { status: 201, body: {} } })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate Dragon' }))

    const names = within(screen.getByRole('list', { name: 'Cards' }))
      .getAllByRole('button', { name: /^(Dragon|Knight)/ })
      .map((b) => b.textContent)
    expect(names).toEqual(['Dragon', 'Dragon (copy)', 'Knight'])
    await waitFor(() => expect(calls(fetchMock, 'POST')).toHaveLength(1))
    expect(JSON.parse(String(calls(fetchMock, 'POST')[0][1]?.body))).toMatchObject({ name: 'Dragon (copy)', position: 1 })
  })

  it('moves a card with Alt+↓ and saves the new order', async () => {
    const fetchMock = stubEditor({ [`PUT ${cardsUrl}/order`]: { status: 204 } })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    fireEvent.keyDown(await screen.findByRole('button', { name: 'Dragon' }), { key: 'ArrowDown', altKey: true })

    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
    expect(JSON.parse(String(calls(fetchMock, 'PUT')[0][1]?.body))).toEqual({ cardIds: [knight.id, dragon.id] })
  })

  it('a stale save opens the conflict dialog; "Load their version" takes theirs', async () => {
    const theirs = { ...dragon, name: 'Their dragon', version: 2 }
    stubEditor({ [`PUT ${cardsUrl}/${dragon.id}`]: { status: 409, body: theirs } })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    const name = await screen.findByLabelText('Card name')

    fireEvent.change(name, { target: { value: 'My dragon' } })
    fireEvent.blur(name)

    const dialog = await screen.findByRole('dialog', { name: '“My dragon” was changed somewhere else' })
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your choice')
    fireEvent.keyDown(window, { key: 'Escape' }) // not a choice
    expect(dialog).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Load their version' }))

    expect(await screen.findByRole('button', { name: 'Their dragon' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('All changes saved'))
  })

  it('Undo and Redo in the header restore a deleted card and select it', async () => {
    const fetchMock = stubEditor({
      [`DELETE ${cardsUrl}/${dragon.id}`]: { status: 204 },
      [`POST ${cardsUrl}`]: { status: 201, body: {} },
    })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    const undoButton = await screen.findByRole('button', { name: '↶ Undo' })
    expect(undoButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Dragon' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete card' }))
    await waitFor(() => expect(calls(fetchMock, 'DELETE')).toHaveLength(1))

    fireEvent.click(undoButton)

    expect(screen.getByLabelText('Card name')).toHaveValue('Dragon')
    expect(screen.getByRole('button', { name: 'Dragon' })).toHaveAttribute('aria-current', 'true')
    await waitFor(() => expect(calls(fetchMock, 'POST')).toHaveLength(1))
    expect(JSON.parse(String(calls(fetchMock, 'POST')[0][1]?.body))).toMatchObject({ id: dragon.id, position: 0 })
    expect(screen.getByRole('button', { name: '↷ Redo' })).toBeEnabled()
  })

  it('Ctrl+Z undoes outside text fields, but not while typing in one', async () => {
    stubEditor({ [`PUT ${cardsUrl}/${dragon.id}`]: (init) => ({ body: { ...dragon, ...JSON.parse(String(init?.body)), version: 2 } }) })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    const name = await screen.findByLabelText('Card name')
    fireEvent.change(name, { target: { value: 'Red dragon' } })
    fireEvent.blur(name)
    expect(await screen.findByRole('button', { name: 'Red dragon' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByLabelText('Card name'), { key: 'z', ctrlKey: true })
    expect(screen.getByRole('button', { name: 'Red dragon' })).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(screen.getByRole('button', { name: 'Dragon' })).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true })
    expect(screen.getByRole('button', { name: 'Red dragon' })).toBeInTheDocument()
  })

  it('shows not found for a Set that is not in this Collection', async () => {
    stubApi({
      [`GET /api/collections/${collectionId}`]: { body: collection },
      [`GET ${setUrl}`]: { status: 404, body: { title: 'Set not found.' } },
      [`GET ${cardsUrl}`]: { status: 404, body: { title: 'Set not found.' } },
    })

    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
  })
})
