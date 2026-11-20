import { useRef, useState } from 'react'
import { ACCEPTED_ARTWORK, checkArtworkFile, uploadArtwork } from '../artwork/api'
import { RangeField } from '../components/RangeField'
import { useOnline } from '../components/useOnline'
import { coverPlacement, MAX_ZOOM, MIN_ZOOM, withZoom, type ArtworkRef } from '../render/artwork'
import { CARD_HEIGHT, CARD_WIDTH } from '../render/units'
import * as actions from './actions'
import styles from './ArtworkProperties.module.css'
import { FillColour } from './CardProperties'
import { useEditor, useEditorApi } from './editorHooks'

type Upload = { state: 'idle' } | { state: 'uploading' } | { state: 'failed'; message: string; file: File | null }

/**
 * The Artwork part: upload, zoom, pan X/Y, Reset to cover, and the fill colour that shows
 * wherever the Artwork leaves the Card uncovered. Drag and the scroll wheel on the canvas do
 * the same as the sliders.
 */
export function ArtworkProperties() {
  const { collectionId } = useEditorApi()
  const card = useEditor((s) => s.cards.find((c) => c.id === s.selectedId))
  const preview = useEditor((s) => s.preview)
  const commit = useEditor((s) => s.commit)
  const setPreview = useEditor((s) => s.setPreview)
  const online = useOnline()
  const [upload, setUpload] = useState<Upload>({ state: 'idle' })
  const picker = useRef<HTMLInputElement>(null)

  if (!card) return null
  const cardId = card.id
  const saved = card.design.artwork
  // While a slider or drag is held, show its value.
  const artwork = (preview?.cardId === cardId && preview.design.artwork) || saved

  async function send(file: File) {
    const problem = await checkArtworkFile(file)
    if (problem) {
      setUpload({ state: 'failed', message: problem, file: null })
      return
    }
    setUpload({ state: 'uploading' })
    try {
      const uploaded = await uploadArtwork(collectionId, file, file.name)
      commit(actions.updateDesign(cardId, { artwork: coverPlacement(uploaded) }))
      setUpload({ state: 'idle' })
    } catch {
      // The Card is unchanged; the same file can be sent again.
      setUpload({ state: 'failed', message: "Couldn't upload the image.", file })
    }
  }

  const place = (next: ArtworkRef) => setPreview({ cardId, design: { artwork: next } })
  const save = (next: ArtworkRef) => commit(actions.updateDesign(cardId, { artwork: next }))
  const percent = (value: number) => `${Math.round(value)}%`

  return (
    <div className={styles.fields}>
      <div className={styles.upload}>
        <input
          ref={picker}
          type="file"
          accept={ACCEPTED_ARTWORK}
          className={styles.hidden}
          aria-label="Artwork file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void send(file)
          }}
        />
        <button
          type="button"
          className={styles.primary}
          disabled={!online || upload.state === 'uploading'}
          onClick={() => picker.current?.click()}
        >
          {upload.state === 'uploading' ? 'Uploading…' : saved ? 'Replace image…' : 'Upload image…'}
        </button>
        <small className={styles.hint}>JPG, PNG or WebP, up to 10 MB.</small>
        {!online && <small className={styles.hint}>You're offline. Upload comes back when you reconnect.</small>}
        {upload.state === 'failed' && (
          <p role="alert" className={styles.error}>
            {upload.message}{' '}
            {upload.file && (
              <button type="button" onClick={() => upload.file && void send(upload.file)} disabled={!online}>
                Retry
              </button>
            )}
          </p>
        )}
      </div>

      {artwork && (
        <>
          <RangeField
            label="Zoom"
            value={artwork.zoom * 100}
            min={MIN_ZOOM * 100}
            max={MAX_ZOOM * 100}
            format={percent}
            onPreview={(value) => place(withZoom(artwork, value / 100))}
            onCommit={(value) => save(withZoom(artwork, value / 100))}
          />
          <RangeField
            label="Pan X"
            value={(artwork.x / CARD_WIDTH) * 100}
            min={-100}
            max={100}
            format={percent}
            onPreview={(value) => place({ ...artwork, x: (value / 100) * CARD_WIDTH })}
            onCommit={(value) => save({ ...artwork, x: (value / 100) * CARD_WIDTH })}
          />
          <RangeField
            label="Pan Y"
            value={(artwork.y / CARD_HEIGHT) * 100}
            min={-100}
            max={100}
            format={percent}
            onPreview={(value) => place({ ...artwork, y: (value / 100) * CARD_HEIGHT })}
            onCommit={(value) => save({ ...artwork, y: (value / 100) * CARD_HEIGHT })}
          />
          <div className={styles.buttons}>
            <button type="button" onClick={() => save(coverPlacement(artwork))}>
              Reset to cover
            </button>
            <button type="button" onClick={() => commit(actions.updateDesign(cardId, { artwork: null }))}>
              Remove image
            </button>
          </div>
          <small className={styles.hint}>Drag the card to move the image; scroll to zoom where you point.</small>
        </>
      )}

      <FillColour key={`${card.id}:${card.design.fill}`} card={card} />
    </div>
  )
}
