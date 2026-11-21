import { useEffect, useRef, useState } from 'react'
import { checkArtworkFile, imageFromClipboard, pastedName, toArtworkBlob, uploadArtwork } from '../artwork/api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { coverPlacement } from '../render/artwork'
import * as actions from './actions'
import styles from './ArtworkPaste.module.css'
import { useEditor, useEditorApi } from './editorHooks'

type Pending = { cardId: string; image: Blob }

/** Typing in a field keeps its own paste. */
function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Ctrl+V of an image anywhere in the editor puts it on the selected Card as its Artwork,
 * placed to cover. Asks first when the Card already has Artwork. Renders only the question
 * and a short message when the paste can't be used.
 */
export function ArtworkPaste() {
  const { collectionId, store } = useEditorApi()
  const commit = useEditor((s) => s.commit)
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // True from the paste until the upload ends or the question is answered.
  const busy = useRef(false)

  async function send({ cardId, image }: Pending) {
    try {
      const uploaded = await uploadArtwork(collectionId, image, await pastedName(image))
      commit(actions.updateDesign(cardId, { artwork: coverPlacement(uploaded) }))
    } catch {
      setMessage("Couldn't upload the image.")
    } finally {
      busy.current = false
    }
  }

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      if (event.defaultPrevented || isTextTarget(event.target)) return
      const pasted = imageFromClipboard(event.clipboardData)
      if (!pasted) return
      event.preventDefault()

      const { cards, selectedId } = store.getState()
      const card = cards.find((c) => c.id === selectedId)
      if (!card || busy.current) return
      busy.current = true
      setMessage(null)

      if (!navigator.onLine) {
        setMessage("You're offline. Pasting comes back when you reconnect.")
        busy.current = false
        return
      }
      const image = await toArtworkBlob(pasted)
      const problem = image ? await checkArtworkFile(image) : "Couldn't read an image from the clipboard."
      if (!image || problem) {
        setMessage(problem)
        busy.current = false
        return
      }
      if (card.design.artwork) setPending({ cardId: card.id, image })
      else await send({ cardId: card.id, image })
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 8000)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <>
      {message && (
        <p role="alert" className={styles.toast}>
          {message}{' '}
          <button type="button" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </p>
      )}
      {pending && (
        <ConfirmDialog
          title="Replace the current image?"
          confirmLabel="Replace"
          onConfirm={() => {
            setPending(null)
            void send(pending)
          }}
          onCancel={() => {
            setPending(null)
            busy.current = false
          }}
        >
          <p>This card already has an image. Pasting replaces it.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
