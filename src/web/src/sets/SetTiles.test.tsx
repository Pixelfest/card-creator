import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery, stubApi } from '../test/renderWithQuery'
import type { CardSet } from './api'
import { SetTiles } from './SetTiles'

const collectionId = '3f9XkQ2bL0aZ7yT1mN4pRs'
const sets = `/api/collections/${collectionId}/sets`

function aSet(id: string, name: string): CardSet {
  return {
    id,
    collectionId,
    name,
    cardFormat: '44x72',
    cardCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

const dragons = aSet('aaaaaaaaaaaaaaaaaaaaaa', 'Dragon Deck')
const events = aSet('bbbbbbbbbbbbbbbbbbbbbb', 'Event cards')

describe('SetTiles', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists each Set with its card count, last change and Open link', async () => {
    stubApi({ [`GET ${sets}`]: { body: [dragons, events] } })

    renderWithQuery(<SetTiles collectionId={collectionId} />)

    expect(await screen.findByDisplayValue('Dragon Deck')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Event cards')).toBeInTheDocument()
    const row = screen.getByDisplayValue('Dragon Deck').closest('li')!
    expect(within(row).getByText(/^0 cards · today /)).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Open Dragon Deck' })).toHaveAttribute(
      'href',
      `/c/${collectionId}/s/${dragons.id}`,
    )
  })

  it("shows a thumbnail of each Set's first Card", async () => {
    const withCards = { ...dragons, cardCount: 2 }
    const card = (id: string, name: string, position: number) => ({
      id,
      setId: dragons.id,
      name,
      copies: 1,
      position,
      version: 1,
      updatedAt: new Date().toISOString(),
      design: { fill: '#ffffff', frame: null, artwork: null, snippets: {} },
    })
    stubApi({
      [`GET ${sets}`]: { body: [withCards] },
      [`GET ${sets}/${dragons.id}/cards`]: { body: [card('cardbbbbbbbbbbbbbbbbb', 'Knight', 1), card('cardaaaaaaaaaaaaaaaaa', 'Dragon', 0)] },
      'GET /api/assets': { body: { frames: [], fonts: [], icons: [], snippetBackgrounds: [] } },
    })

    renderWithQuery(<SetTiles collectionId={collectionId} />)

    expect(await screen.findByRole('img', { name: 'Preview of Dragon', hidden: true })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Preview of Knight', hidden: true })).not.toBeInTheDocument()
  })

  it('says so when there are no Sets', async () => {
    stubApi({ [`GET ${sets}`]: { body: [] } })

    renderWithQuery(<SetTiles collectionId={collectionId} />)

    expect(await screen.findByText('No sets yet.')).toBeInTheDocument()
  })

  it('renames a Set in place', async () => {
    const fetchMock = stubApi({
      [`GET ${sets}`]: { body: [dragons] },
      [`PATCH ${sets}/${dragons.id}`]: { body: { ...dragons, name: 'Dragons' } },
    })
    renderWithQuery(<SetTiles collectionId={collectionId} />)
    const input = await screen.findByLabelText('Name of set Dragon Deck')

    fireEvent.change(input, { target: { value: 'Dragons' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `${sets}/${dragons.id}`,
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Dragons' }) }),
      ),
    )
  })

  it('duplicates a Set', async () => {
    const fetchMock = stubApi({
      [`GET ${sets}`]: { body: [dragons] },
      [`POST ${sets}/${dragons.id}/duplicate`]: { status: 201, body: aSet('cccccccccccccccccccccc', 'Dragon Deck (copy)') },
    })
    renderWithQuery(<SetTiles collectionId={collectionId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate Dragon Deck' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `${sets}/${dragons.id}/duplicate`,
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('deletes only after the exact Set name is typed', async () => {
    let remaining = [dragons, events]
    const fetchMock = stubApi({
      [`GET ${sets}`]: () => ({ body: remaining }),
      [`DELETE ${sets}/${dragons.id}`]: () => {
        remaining = [events]
        return { status: 204 }
      },
    })
    renderWithQuery(<SetTiles collectionId={collectionId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dragon Deck' }))
    const dialog = screen.getByRole('dialog', { name: /delete “dragon deck”/i })
    const confirm = within(dialog).getByRole('button', { name: 'Delete set' })
    const typed = within(dialog).getByLabelText('Set name to confirm')

    expect(confirm).toBeDisabled()
    fireEvent.change(typed, { target: { value: 'dragon deck' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(typed, { target: { value: 'Dragon Deck' } })
    expect(confirm).toBeEnabled()

    fireEvent.click(confirm)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByDisplayValue('Dragon Deck')).not.toBeInTheDocument())
    expect(screen.getByDisplayValue('Event cards')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`${sets}/${dragons.id}`, expect.objectContaining({ method: 'DELETE' }))
  })

  it('cancelling the delete dialog deletes nothing', async () => {
    const fetchMock = stubApi({ [`GET ${sets}`]: { body: [dragons] } })
    renderWithQuery(<SetTiles collectionId={collectionId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dragon Deck' }))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })
})
