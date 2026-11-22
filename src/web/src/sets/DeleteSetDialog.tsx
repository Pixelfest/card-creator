import { useEffect, useId, useState, type FormEvent } from 'react'
import { useSetMutations, type CardSet } from './api'
import styles from './DeleteSetDialog.module.css'
import ui from '../ui/ui.module.css'

/** Deleting cannot be undone, so the user types the Set's name to confirm. */
export function DeleteSetDialog({
  collectionId,
  set,
  onClose,
}: {
  collectionId: string
  set: CardSet
  onClose: () => void
}) {
  const { remove } = useSetMutations(collectionId)
  const [typed, setTyped] = useState('')
  const titleId = useId()
  const matches = typed === set.name

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function confirm(event: FormEvent) {
    event.preventDefault()
    if (!matches) return
    remove.mutate(set.id, { onSuccess: onClose })
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
        onSubmit={confirm}
      >
        <h2 id={titleId}>Delete “{set.name}”?</h2>
        <p>
          This deletes the set and its cards. It cannot be undone. Type the set name to confirm.
        </p>
        <input
          aria-label="Set name to confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoFocus
          autoComplete="off"
        />
        {remove.isError && (
          <p role="alert" className={ui.error}>
            Couldn't delete the set. Try again.
          </p>
        )}
        <div className={styles.buttons}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={ui.danger} disabled={!matches || remove.isPending}>
            Delete set
          </button>
        </div>
      </form>
    </div>
  )
}
