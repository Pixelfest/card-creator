import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssetManifest } from '../assets/api'
import { CornerIconProperties } from './CornerIconProperties'
import { EditorContext } from './editorHooks'
import { createEditor } from './store'
import { card, FakeCardsApi, serverCard } from './testing'

const manifest: AssetManifest = {
  frames: [],
  fonts: [],
  snippetBackgrounds: [],
  icons: [
    { path: 'icons/star.png', displayName: 'Star', url: '/assets/a/icons/star.png', aspectRatio: 1 },
    { path: 'icons/heart.png', displayName: 'Heart', url: '/assets/b/icons/heart.png', aspectRatio: 1 },
  ],
  emoji: null,
}

function setup(initial = card('A')) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } })))
  const api = new FakeCardsApi([serverCard(initial)])
  const editor = createEditor({ api, initial: api.cards.map((c) => ({ ...c })), sleep: async () => {} })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (ui: ReactNode) => (
    <QueryClientProvider client={client}>
      <EditorContext.Provider value={editor}>{ui}</EditorContext.Provider>
    </QueryClientProvider>
  )
  render(wrap(<CornerIconProperties />))
  const design = () => editor.store.getState().cards[0].design
  return { design, editor }
}

afterEach(() => vi.unstubAllGlobals())

describe('CornerIconProperties', () => {
  it('shows the defaults for a Card saved before corner icons: no icon, no corners, 8% and 4%', async () => {
    setup()

    fireEvent.click(await screen.findByRole('button', { name: 'Change icon' }))
    expect(await screen.findByRole('radio', { name: 'Star' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    for (const name of ['Top left', 'Top right', 'Bottom left', 'Bottom right']) expect(screen.getByRole('checkbox', { name })).not.toBeChecked()
    expect(screen.getByLabelText('Size')).toHaveValue(8)
    expect(screen.getByLabelText('Distance from top/bottom')).toHaveValue(4)
    expect(screen.getByLabelText('Distance from sides')).toHaveValue(4)
  })

  it('saves the chosen icon and ticked corners with the card', async () => {
    const { design } = setup()

    fireEvent.click(await screen.findByRole('button', { name: 'Change icon' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Heart' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Top right' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bottom left' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Top right' }))

    expect(design().cornerIcons).toEqual({ icon: 'icons/heart.png', corners: ['bottomLeft'], size: 8, insetY: 4, insetX: 4 })
  })

  it('previews a typed size, then saves it clamped to 2–15% when the box is left', async () => {
    const { design, editor } = setup()
    const box = await screen.findByLabelText('Size')

    fireEvent.change(box, { target: { value: '12' } })
    expect(editor.store.getState().preview?.design.cornerIcons?.size).toBe(12)
    expect(design().cornerIcons).toBeUndefined()

    fireEvent.change(box, { target: { value: '40' } })
    fireEvent.blur(box)
    expect(design().cornerIcons?.size).toBe(15)
  })
})
