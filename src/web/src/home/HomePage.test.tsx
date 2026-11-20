import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordVisit } from '../collections/recentCollections'
import { renderWithQuery, stubApi } from '../test/renderWithQuery'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('offers New collection to an allowlisted client', async () => {
    stubApi({ 'GET /api/collection-creation': { body: { allowed: true } } })

    renderWithQuery(<HomePage />)

    expect(await screen.findByRole('button', { name: '+ New collection' })).toBeInTheDocument()
    expect(screen.queryByText(/creating collections is restricted/i)).not.toBeInTheDocument()
  })

  it('shows a note with the client IP instead to everyone else', async () => {
    stubApi({ 'GET /api/collection-creation': { body: { allowed: false, clientIp: '198.51.100.20' } } })

    renderWithQuery(<HomePage />)

    expect(await screen.findByText(/creating collections is restricted/i)).toBeInTheDocument()
    expect(screen.getByText('198.51.100.20')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ New collection' })).not.toBeInTheDocument()
  })

  it('lists recently opened Collections from this browser', async () => {
    stubApi({ 'GET /api/collection-creation': { body: { allowed: false } } })
    recordVisit({ id: '3f9XkQ2bL0aZ7yT1mN4pRs', name: 'Dragon Game' })

    renderWithQuery(<HomePage />)

    const link = screen.getByRole('link', { name: 'Dragon Game' })
    expect(link).toHaveAttribute('href', '/c/3f9XkQ2bL0aZ7yT1mN4pRs')
    expect(screen.getByText('opened today')).toBeInTheDocument()
  })
})
