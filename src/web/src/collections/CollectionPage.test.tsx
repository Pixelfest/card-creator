import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery, stubApi } from '../test/renderWithQuery'
import { CollectionPage } from './CollectionPage'
import { loadRecent, recordVisit } from './recentCollections'

const id = '3f9XkQ2bL0aZ7yT1mN4pRs'
const collection = { id, name: 'Dragon Game', createdAt: '2026-11-19T10:00:00Z' }

describe('CollectionPage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('shows the name and remembers the visit', async () => {
    stubApi({
      [`GET /api/collections/${id}`]: { body: collection },
      [`GET /api/collections/${id}/sets`]: { body: [] },
    })

    renderWithQuery(<CollectionPage collectionId={id} />)

    expect(await screen.findByDisplayValue('Dragon Game')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy collection link/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New set' })).toBeInTheDocument()
    expect(await screen.findByText('No sets yet.')).toBeInTheDocument()
    await waitFor(() => expect(loadRecent().map((r) => r.name)).toEqual(['Dragon Game']))
  })

  it('renames on Enter', async () => {
    const fetchMock = stubApi({
      [`GET /api/collections/${id}`]: { body: collection },
      [`GET /api/collections/${id}/sets`]: { body: [] },
      [`PATCH /api/collections/${id}`]: (init) => ({
        body: { ...collection, name: JSON.parse(String(init?.body)).name },
      }),
    })
    renderWithQuery(<CollectionPage collectionId={id} />)
    const input = await screen.findByLabelText('Collection name')

    fireEvent.change(input, { target: { value: 'Event cards' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    // The tab title comes from the saved Collection, not the draft in the field.
    await waitFor(() => expect(document.title).toBe('Event cards · Card Creator'))
    expect(screen.getByLabelText('Collection name')).toHaveValue('Event cards')
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ name: 'Event cards' })
  })

  it('does not save a blank name', async () => {
    const fetchMock = stubApi({
      [`GET /api/collections/${id}`]: { body: collection },
      [`GET /api/collections/${id}/sets`]: { body: [] },
    })
    renderWithQuery(<CollectionPage collectionId={id} />)
    const input = await screen.findByLabelText('Collection name')

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)

    expect(screen.getByDisplayValue('Dragon Game')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('shows not found for an unknown id and forgets it', async () => {
    recordVisit({ id, name: 'Gone' })
    stubApi({ [`GET /api/collections/${id}`]: { status: 404, body: { title: 'Collection not found.' } } })

    renderWithQuery(<CollectionPage collectionId={id} />)

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    await waitFor(() => expect(loadRecent()).toEqual([]))
  })
})

describe('New set', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates a Set and shows it in the table', async () => {
    const created = {
      id: 'aaaaaaaaaaaaaaaaaaaaaa',
      collectionId: id,
      name: 'Untitled set',
      cardFormat: '44x72',
      cardCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    let sets: unknown[] = []
    stubApi({
      [`GET /api/collections/${id}`]: { body: collection },
      [`GET /api/collections/${id}/sets`]: () => ({ body: sets }),
      [`POST /api/collections/${id}/sets`]: () => {
        sets = [created]
        return { status: 201, body: created }
      },
    })
    renderWithQuery(<CollectionPage collectionId={id} />)

    fireEvent.click(await screen.findByRole('button', { name: '+ New set' }))

    expect(await screen.findByDisplayValue('Untitled set')).toBeInTheDocument()
  })
})
