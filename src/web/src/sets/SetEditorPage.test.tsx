import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery, stubApi } from '../test/renderWithQuery'
import { SetEditorPage } from './SetEditorPage'

const collectionId = '3f9XkQ2bL0aZ7yT1mN4pRs'
const setId = 'aaaaaaaaaaaaaaaaaaaaaa'
const setUrl = `/api/collections/${collectionId}/sets/${setId}`
const collection = { id: collectionId, name: 'Dragon Game', createdAt: '2026-11-19T10:00:00Z' }
const set = {
  id: setId,
  collectionId,
  name: 'Dragon Deck',
  cardFormat: '44x72',
  cardCount: 0,
  createdAt: '2026-11-19T10:00:00Z',
  updatedAt: '2026-11-19T10:00:00Z',
}

describe('SetEditorPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the shell: back to the Collection, the Set name and the placeholder areas', async () => {
    stubApi({
      [`GET /api/collections/${collectionId}`]: { body: collection },
      [`GET ${setUrl}`]: { body: set },
    })

    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    expect(await screen.findByLabelText('Set name')).toHaveValue('Dragon Deck')
    expect(await screen.findByRole('link', { name: '← Dragon Game' })).toHaveAttribute('href', `/c/${collectionId}`)
    expect(screen.getByRole('complementary', { name: 'Cards' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Card' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Properties' })).toBeInTheDocument()
  })

  it('uses the Set name as the tab title', async () => {
    stubApi({
      [`GET /api/collections/${collectionId}`]: { body: collection },
      [`GET ${setUrl}`]: { body: set },
    })

    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    await waitFor(() => expect(document.title).toBe('Dragon Deck'))
  })

  it('shows not found for a Set that is not in this Collection', async () => {
    stubApi({
      [`GET /api/collections/${collectionId}`]: { body: collection },
      [`GET ${setUrl}`]: { status: 404, body: { title: 'Set not found.' } },
    })

    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
  })
})
