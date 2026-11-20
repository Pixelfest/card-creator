import { ConfirmDialog } from '../components/ConfirmDialog'
import { useEditor } from './editorHooks'
import type { SaveStatus as Status } from './saver'
import styles from './SaveStatus.module.css'

const labels: Record<Status, string> = {
  saved: 'All changes saved',
  saving: 'Saving…',
  retrying: "Couldn't save, retrying",
  conflict: 'Waiting for your choice',
}

/** The header's save status line. */
export function SaveStatus() {
  const status = useEditor((s) => s.status)
  return (
    <span className={`${styles.status} ${styles[status]}`} role="status" aria-live="polite">
      {labels[status]}
    </span>
  )
}

/** "This card was changed elsewhere": load their version, or keep mine (overwrites). */
export function ConflictDialog() {
  const conflict = useEditor((s) => s.conflict)
  const mine = useEditor((s) => s.cards.find((c) => c.id === s.conflict?.cardId))
  const resolve = useEditor((s) => s.resolveConflict)
  const select = useEditor((s) => s.select)

  if (!conflict) return null
  const name = mine?.name ?? conflict.theirs.name

  return (
    <ConfirmDialog
      title={`“${name}” was changed somewhere else`}
      confirmLabel="Keep mine"
      cancelLabel="Load their version"
      dismissible={false}
      onConfirm={() => {
        select(conflict.cardId)
        resolve('mine')
      }}
      onCancel={() => {
        select(conflict.cardId)
        resolve('theirs')
      }}
    >
      <p>
        Someone saved this card while you were editing it. Load their version to drop your
        change, or keep yours to overwrite theirs.
      </p>
    </ConfirmDialog>
  )
}
