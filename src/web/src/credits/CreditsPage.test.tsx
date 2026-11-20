import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery, stubApi } from '../test/renderWithQuery'
import { CreditsPage } from './CreditsPage'

describe('CreditsPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the Twemoji attribution and CREDITS.md', async () => {
    stubApi({
      'GET /api/credits': {
        body: {
          markdown:
            '# Credits\n\n## Fonts\n\n- **Cinzel**, licence in `fonts/OFL.txt`, [source](https://github.com/NDISCOVER/Cinzel)\n- <script>alert(1)</script>',
        },
      },
    })

    renderWithQuery(<CreditsPage />)

    expect(screen.getByRole('link', { name: 'CC-BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    )
    expect(await screen.findByRole('heading', { name: 'Fonts' })).toBeInTheDocument()
    expect(screen.getByText('Cinzel').tagName).toBe('STRONG')
    expect(screen.getByText('fonts/OFL.txt').tagName).toBe('CODE')
    expect(screen.getByRole('link', { name: 'source' })).toHaveAttribute('href', 'https://github.com/NDISCOVER/Cinzel')
    // Markup in the file is shown as text, never run.
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })

  it('has the footer Credits link', () => {
    stubApi({ 'GET /api/credits': { body: { markdown: '' } } })

    renderWithQuery(<CreditsPage />)

    expect(screen.getByRole('contentinfo')).toContainElement(screen.getByRole('link', { name: 'Credits' }))
  })
})
