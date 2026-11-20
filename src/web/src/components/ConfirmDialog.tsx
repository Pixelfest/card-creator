import { useEffect, useId, type ReactNode } from 'react'
import styles from './ConfirmDialog.module.css'

/**
 * A modal shell: a title, content and a row of buttons. Escape or the backdrop calls
 * `onCancel`, unless `dismissible` is false.
 */
export function Dialog({
  title,
  children,
  buttons,
  dismissible = true,
  wide = false,
  onCancel,
}: {
  title: string
  children?: ReactNode
  buttons: ReactNode
  dismissible?: boolean
  wide?: boolean
  onCancel: () => void
}) {
  const titleId = useId()

  useEffect(() => {
    if (!dismissible) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, dismissible])

  return (
    <div className={styles.backdrop} onClick={dismissible ? onCancel : undefined}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={wide ? `${styles.dialog} ${styles.wide}` : styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className={styles.buttons}>{buttons}</div>
      </div>
    </div>
  )
}

/**
 * A small modal with a question and two answers. Escape or the backdrop cancels, unless
 * `dismissible` is false (when both answers are real choices).
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  dismissible = true,
  onConfirm,
  onCancel,
}: {
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  dismissible?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog
      title={title}
      dismissible={dismissible}
      onCancel={onCancel}
      buttons={
        <>
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? styles.danger : styles.primary} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}
