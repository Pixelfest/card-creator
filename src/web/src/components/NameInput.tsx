import { useRef, useState, type KeyboardEvent } from 'react'
import styles from './NameInput.module.css'
import ui from '../ui/ui.module.css'

type NameInputProps = {
  value: string
  label: string
  className?: string
  /** Saves the trimmed, changed name. A rejected promise restores the old name. */
  onCommit: (name: string) => Promise<unknown>
}

/**
 * A name edited in place: saved on Enter or when leaving the field, Escape cancels, and a
 * blank or unchanged name is not saved.
 */
export function NameInput(props: NameInputProps) {
  // Remount when the saved name changes, so the draft starts from it.
  return <Editor key={props.value} {...props} />
}

function Editor({ value, label, className, onCommit }: NameInputProps) {
  const [draft, setDraft] = useState(value)
  const [failed, setFailed] = useState(false)
  const cancelled = useRef(false)

  function commit() {
    const name = draft.trim()
    if (cancelled.current || !name || name === value) {
      cancelled.current = false
      setDraft(value)
      return
    }
    onCommit(name).then(
      () => setFailed(false),
      () => {
        setDraft(value)
        setFailed(true)
      },
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      cancelled.current = true
      event.currentTarget.blur()
    }
  }

  return (
    <div className={styles.wrapper}>
      <input
        className={`${styles.input} ${className ?? ''}`}
        aria-label={label}
        value={draft}
        maxLength={200}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {failed && (
        <p role="alert" className={ui.error}>
          Couldn't save the name. Try again.
        </p>
      )}
    </div>
  )
}
