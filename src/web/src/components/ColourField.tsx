import { useEffect, useRef } from 'react'
import styles from './ColourField.module.css'

/**
 * A colour picker shown live while open (`onPreview`, on every `input`) and saved when it
 * closes (`onCommit`, the native `change` event, which React's onChange does not expose).
 * Remount it (key) when the saved value changes.
 */
export function ColourField({
  label,
  value,
  disabled,
  hint,
  onPreview,
  onCommit,
}: {
  label: string
  value: string
  disabled?: boolean
  hint?: string
  onPreview: (value: string) => void
  onCommit: (value: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  }, [onCommit])

  useEffect(() => {
    const element = input.current
    if (!element) return
    const onChange = () => commit.current(element.value)
    element.addEventListener('change', onChange)
    return () => element.removeEventListener('change', onChange)
  }, [])

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.row}>
        <input
          ref={input}
          type="color"
          defaultValue={value}
          disabled={disabled}
          onInput={(event) => onPreview(event.currentTarget.value)}
        />
        <code>{value}</code>
      </span>
      {hint && <small className={styles.hint}>{hint}</small>}
    </label>
  )
}
