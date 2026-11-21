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
  fonts: [
    { path: 'fonts/Cinzel-Bold.woff2', displayName: 'Cinzel Bold', url: '/assets/c1/fonts/Cinzel-Bold.woff2', aspectRatio: null },
    { path: 'fonts/Crimson-Pro-Regular.woff2', displayName: 'Crimson Pro Regular', url: '/assets/l1/fonts/Crimson-Pro-Regular.woff2', aspectRatio: null },
  ],
  snippetBackgrounds: [],
  icons: [],
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

  it('picks a Frame from the tiles and saves it in the design', async () => {
    const fetchMock = stubEditor({
      [`PUT ${cardsUrl}/${dragon.id}`]: (init) => ({ body: { ...dragon, ...JSON.parse(String(init?.body)), version: 2 } }),
    })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Frame' }))
    const tiles = await screen.findByRole('radiogroup', { name: 'Frame' })
    expect(within(tiles).getByRole('radio', { name: 'Gold border' })).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(within(tiles).getByRole('radio', { name: 'None' }))

    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
    expect(JSON.parse(String(calls(fetchMock, 'PUT')[0][1]?.body)).design).toMatchObject({ frame: null })
    expect(within(tiles).getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true')
  })

  it('flags a card whose Frame is missing, in the list and on the Frame control', async () => {
    const lost = serverCard('cardccccccccccccccccc', 'Lost', 0)
    stubApi({
      [`GET /api/collections/${collectionId}`]: { body: collection },
      [`GET ${setUrl}`]: { body: set },
      [`GET ${cardsUrl}`]: { body: [{ ...lost, design: { ...design, frame: 'frames/44x72/deleted.png' } }] },
      'GET /api/assets': { body: assets },
    })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    expect(await screen.findByRole('img', { name: 'Lost has warnings' })).toHaveTextContent('⚠')
    fireEvent.click(screen.getByRole('button', { name: /^Frame/ }))
    expect(await screen.findByRole('note')).toHaveTextContent('The Frame “deleted.png” is missing.')
  })

  it('uploads Artwork, places it to cover and saves it in the design', async () => {
    const uploaded = { id: 'artaaaaaaaaaaaaaaaaaaa', url: '/x', width: 2000, height: 1000, contentType: 'image/png' }
    const fetchMock = stubEditor({
      [`POST /api/collections/${collectionId}/artwork`]: { status: 201, body: uploaded },
      [`PUT ${cardsUrl}/${dragon.id}`]: (init) => ({ body: { ...dragon, ...JSON.parse(String(init?.body)), version: 2 } }),
    })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Artwork' }))
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])], 'dragon.png', { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('Artwork file'), { target: { files: [png] } })

    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
    const upload = calls(fetchMock, 'POST').find(([url]) => String(url).endsWith('/artwork'))!
    expect(upload[1]?.body).toBeInstanceOf(FormData)
    expect(JSON.parse(String(calls(fetchMock, 'PUT')[0][1]?.body)).design.artwork).toEqual({
      id: uploaded.id,
      width: 2000,
      height: 1000,
      zoom: 1,
      x: 0,
      y: 0,
    })
    expect(await screen.findByRole('button', { name: 'Reset to cover' })).toBeInTheDocument()
    expect(screen.getAllByRole('slider').map((s) => (s as HTMLInputElement).value)).toEqual(['100', '0', '0'])
  })

  it('refuses a file that is not an image before uploading', async () => {
    const fetchMock = stubEditor()
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Artwork' }))

    fireEvent.change(screen.getByLabelText('Artwork file'), { target: { files: [new File(['hello'], 'notes.jpg')] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Only JPG, PNG and WebP images can be used.')
    expect(calls(fetchMock, 'POST')).toHaveLength(0)
  })

  it('a failed upload shows an inline error with Retry and leaves the card unchanged', async () => {
    let attempts = 0
    const uploaded = { id: 'artbbbbbbbbbbbbbbbbbbb', url: '/x', width: 100, height: 100, contentType: 'image/png' }
    const fetchMock = stubEditor({
      [`POST /api/collections/${collectionId}/artwork`]: () => (++attempts === 1 ? { status: 500, body: {} } : { status: 201, body: uploaded }),
      [`PUT ${cardsUrl}/${dragon.id}`]: (init) => ({ body: { ...dragon, ...JSON.parse(String(init?.body)), version: 2 } }),
    })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Artwork' }))
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'a.png')

    fireEvent.change(screen.getByLabelText('Artwork file'), { target: { files: [png] } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't upload the image.")
    expect(calls(fetchMock, 'PUT')).toHaveLength(0)

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
    expect(attempts).toBe(2)
  })

  describe('pasting an image', () => {
    const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]
    const png = () => new File([new Uint8Array(pngBytes)], 'image.png', { type: 'image/png' })
    const clipboard = (...items: { type: string; file?: File }[]) => ({
      items: items.map((i) => ({ kind: i.file ? 'file' : 'string', type: i.type, getAsFile: () => i.file ?? null })),
    })
    const uploaded = { id: 'artcccccccccccccccccc', url: '/x', width: 400, height: 300, contentType: 'image/png' }
    const artworkUrl = `/api/collections/${collectionId}/artwork`
    const withArtwork = { ...dragon, design: { ...design, artwork: { id: 'artoldoldoldoldoldold', width: 10, height: 10, zoom: 1, x: 0, y: 0 } } }
    const stubPaste = (card: Omit<typeof dragon, 'design'> & { design: object } = dragon) =>
      stubEditor({
        [`GET ${cardsUrl}`]: { body: [card, knight] },
        [`POST ${artworkUrl}`]: { status: 201, body: uploaded },
        [`PUT ${cardsUrl}/${card.id}`]: (init) => ({ body: { ...card, ...JSON.parse(String(init?.body)), version: 2 } }),
      })
    const posts = (fetchMock: ReturnType<typeof stubApi>) => calls(fetchMock, 'POST').filter(([url]) => String(url).endsWith('/artwork'))

    it('puts a pasted image on a card without Artwork, whichever part is open', async () => {
      const fetchMock = stubPaste()
      renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
      await screen.findByLabelText('Card name')

      fireEvent.paste(document.body, { clipboardData: clipboard({ type: 'text/plain' }, { type: 'image/png', file: png() }) })

      await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
      expect((posts(fetchMock)[0][1]?.body as FormData).get('file')).toHaveProperty('name', 'pasted-image.png')
      expect(JSON.parse(String(calls(fetchMock, 'PUT')[0][1]?.body)).design.artwork).toMatchObject({ id: uploaded.id, zoom: 1 })
    })

    it('asks before replacing existing Artwork, and uploads nothing when cancelled', async () => {
      const fetchMock = stubPaste(withArtwork)
      renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
      await screen.findByLabelText('Card name')

      fireEvent.paste(document.body, { clipboardData: clipboard({ type: 'image/png', file: png() }) })
      const dialog = await screen.findByRole('dialog', { name: 'Replace the current image?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(posts(fetchMock)).toHaveLength(0)
      expect(calls(fetchMock, 'PUT')).toHaveLength(0)
    })

    it('replaces existing Artwork once confirmed', async () => {
      const fetchMock = stubPaste(withArtwork)
      renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
      await screen.findByLabelText('Card name')

      fireEvent.paste(document.body, { clipboardData: clipboard({ type: 'image/png', file: png() }) })
      fireEvent.click(await screen.findByRole('button', { name: 'Replace' }))

      await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
      expect(JSON.parse(String(calls(fetchMock, 'PUT')[0][1]?.body)).design.artwork.id).toBe(uploaded.id)
    })

    it('ignores a paste into a text field and a clipboard with no image', async () => {
      const fetchMock = stubPaste()
      renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
      const name = await screen.findByLabelText('Card name')

      fireEvent.paste(name, { clipboardData: clipboard({ type: 'image/png', file: png() }) })
      fireEvent.paste(document.body, { clipboardData: clipboard({ type: 'text/plain' }) })

      await new Promise((r) => setTimeout(r, 20))
      expect(posts(fetchMock)).toHaveLength(0)
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('says so when the pasted image is not a usable format and cannot be converted', async () => {
      const fetchMock = stubPaste()
      vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('no')))
      renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
      await screen.findByLabelText('Card name')

      fireEvent.paste(document.body, { clipboardData: clipboard({ type: 'image/x-emf', file: new File(['emf'], 'a.emf', { type: 'image/x-emf' }) }) })

      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read an image from the clipboard.")
      expect(posts(fetchMock)).toHaveLength(0)
    })

    it('converts a BMP to PNG before uploading', async () => {
      const fetchMock = stubPaste()
      vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 4, height: 3, close: () => {} }))
      const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as never)
      const toBlob = vi
        .spyOn(HTMLCanvasElement.prototype, 'toBlob')
        .mockImplementation((callback) => callback(new Blob([new Uint8Array(pngBytes)], { type: 'image/png' })))
      renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
      await screen.findByLabelText('Card name')

      fireEvent.paste(document.body, { clipboardData: clipboard({ type: 'image/bmp', file: new File(['BM'], 'a.bmp', { type: 'image/bmp' }) }) })

      await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
      expect((posts(fetchMock)[0][1]?.body as FormData).get('file')).toHaveProperty('name', 'pasted-image.png')
      getContext.mockRestore()
      toBlob.mockRestore()
    })

    it('does nothing but say so while offline', async () => {
      const fetchMock = stubPaste()
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
      await screen.findByLabelText('Card name')

      fireEvent.paste(document.body, { clipboardData: clipboard({ type: 'image/png', file: png() }) })

      expect(await screen.findByRole('alert')).toHaveTextContent("You're offline")
      expect(posts(fetchMock)).toHaveLength(0)
      online.mockRestore()
    })
  })

  it('disables upload while offline', async () => {
    stubEditor()
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Artwork' }))

    expect(screen.getByRole('button', { name: 'Upload image…' })).toBeDisabled()
    expect(screen.getByText(/You're offline/)).toBeInTheDocument()
    online.mockRestore()
  })

  it('"+ Header" adds a header with the slot defaults and the first font', async () => {
    const fetchMock = stubEditor({
      [`PUT ${cardsUrl}/${dragon.id}`]: (init) => ({ body: { ...dragon, ...JSON.parse(String(init?.body)), version: 2 } }),
    })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    await screen.findByRole('radiogroup', { name: 'Font' }).catch(() => null)

    fireEvent.click(await screen.findByRole('button', { name: '+ Header' }))

    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
    expect(JSON.parse(String(calls(fetchMock, 'PUT')[0][1]?.body)).design.snippets.header).toEqual({
      text: 'Header',
      font: 'fonts/Cinzel-Bold.woff2',
      size: 12,
      position: 6,
      zoom: 80,
      color: '#1a1a1a',
      outline: false,
      outlineColor: '#ffffff',
      align: 'center',
      background: null,
    })
    expect(screen.getByRole('button', { name: 'Header' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Header')
  })

  it('edits a snippet: text on blur, font, alignment and outline, then removes it', async () => {
    const withHeader = {
      ...dragon,
      design: { ...design, snippets: { header: { text: 'Old', font: 'fonts/Cinzel-Bold.woff2', size: 12, position: 6, zoom: 80, color: '#000000', outline: false, outlineColor: '#ffffff', align: 'center', background: null } } },
    }
    let version = 1
    const fetchMock = stubApi({
      [`GET /api/collections/${collectionId}`]: { body: collection },
      [`GET ${setUrl}`]: { body: set },
      [`GET ${cardsUrl}`]: { body: [withHeader] },
      'GET /api/assets': { body: assets },
      [`PUT ${cardsUrl}/${dragon.id}`]: (init) => ({ body: { ...withHeader, ...JSON.parse(String(init?.body)), version: ++version } }),
    })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Header' }))
    const lastHeader = () => JSON.parse(String(calls(fetchMock, 'PUT').at(-1)![1]?.body)).design.snippets.header

    const textArea = screen.getByRole('textbox', { name: 'Text' })
    fireEvent.change(textArea, { target: { value: 'Fire dragon 🔥' } })
    expect(calls(fetchMock, 'PUT')).toHaveLength(0) // not until the field is left
    fireEvent.blur(textArea)
    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(1))
    expect(lastHeader().text).toBe('Fire dragon 🔥')

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Font' })).getByRole('radio', { name: 'Crimson Pro Regular' }))
    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(2))
    expect(lastHeader().font).toBe('fonts/Crimson-Pro-Regular.woff2')

    fireEvent.click(screen.getByRole('radio', { name: 'Align left' }))
    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(3))
    expect(lastHeader().align).toBe('left')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Outline' }))
    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(4))
    expect(lastHeader().outline).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Remove header' }))
    await waitFor(() => expect(calls(fetchMock, 'PUT')).toHaveLength(5))
    expect(lastHeader()).toBeUndefined()
    expect(screen.getByRole('button', { name: '+ Header' })).toBeInTheDocument()
  })

  it("shows a doesn't-fit warning on the snippet and in the card list", async () => {
    const crowded = {
      ...dragon,
      design: { ...design, snippets: { textbox: { text: Array(300).fill('word').join(' '), font: 'fonts/Crimson-Pro-Regular.woff2', size: 24, position: 80, zoom: 50, color: '#000000', outline: false, outlineColor: '#ffffff', align: 'center', background: null } } },
    }
    stubApi({
      [`GET /api/collections/${collectionId}`]: { body: collection },
      [`GET ${setUrl}`]: { body: set },
      [`GET ${cardsUrl}`]: { body: [crowded] },
      'GET /api/assets': { body: assets },
    })
    renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)

    expect(await screen.findByRole('img', { name: 'Dragon has warnings' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Textbox/ }))
    expect(await screen.findByRole('note')).toHaveTextContent("The textbox text doesn't fit.")
  })

  describe('Export to Word', () => {
    const ghost = serverCard('cardddddddddddddddddd', 'Ghost', 2, 1, 0)
    const lostKnight = { ...knight, design: { ...design, frame: 'frames/44x72/deleted.png' } }

    function openExport(cards: unknown[] = [dragon, lostKnight, ghost]) {
      stubApi({
        [`GET /api/collections/${collectionId}`]: { body: collection },
        [`GET ${setUrl}`]: { body: set },
        [`GET ${cardsUrl}`]: { body: cards },
        'GET /api/assets': { body: assets },
      })
      renderWithQuery(<SetEditorPage collectionId={collectionId} setId={setId} />)
    }

    it('lists the Cards with Copies-0 unchecked and disabled, the totals, warnings and the reminder', async () => {
      openExport()
      fireEvent.click(await screen.findByRole('button', { name: 'Export to Word…' }))
      const dialog = screen.getByRole('dialog', { name: 'Export to Word' })

      expect(within(dialog).getByRole('checkbox', { name: /Dragon/ })).toBeChecked()
      expect(within(dialog).getByRole('checkbox', { name: /Knight/ })).toBeChecked()
      const ghostBox = within(dialog).getByRole('checkbox', { name: /Ghost/ })
      expect(ghostBox).not.toBeChecked()
      expect(ghostBox).toBeDisabled()
      expect(within(dialog).getByText('4 cards on 1 page')).toBeInTheDocument()
      expect(within(dialog).getByText(/Print at 100% \/ Actual size: don't use Fit to page/)).toBeInTheDocument()
      expect(await within(dialog).findByText(/The Frame “deleted.png” is missing./)).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Export anyway' })).toBeEnabled()

      // Unchecking Knight drops its Copies and its warning.
      fireEvent.click(within(dialog).getByRole('checkbox', { name: /Knight/ }))
      expect(within(dialog).getByText('1 card on 1 page')).toBeInTheDocument()
      expect(within(dialog).queryByText(/deleted.png/)).not.toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Export' })).toBeEnabled()

      fireEvent.click(within(dialog).getByRole('button', { name: 'None' }))
      expect(within(dialog).getByText('0 cards on 0 pages')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Export' })).toBeDisabled()

      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('counts pages of 12', async () => {
      openExport([{ ...dragon, copies: 12 }, { ...knight, copies: 1 }])
      fireEvent.click(await screen.findByRole('button', { name: 'Export to Word…' }))
      expect(screen.getByText('13 cards on 2 pages')).toBeInTheDocument()
    })

    it('shows an error with Retry when the export fails, and downloads nothing', async () => {
      openExport([dragon])
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      fireEvent.click(await screen.findByRole('button', { name: 'Export to Word…' }))
      const dialog = screen.getByRole('dialog', { name: 'Export to Word' })

      // jsdom has no canvas, so rendering the card fails.
      await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Export' })).toBeEnabled())
      fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/The export failed\..*Nothing was downloaded\./)
      expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeEnabled()
      expect(click).not.toHaveBeenCalled()
      click.mockRestore()
    })

    it('is disabled while offline', async () => {
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      openExport()
      expect(await screen.findByRole('button', { name: 'Export to Word…' })).toBeDisabled()
      online.mockRestore()
    })
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
