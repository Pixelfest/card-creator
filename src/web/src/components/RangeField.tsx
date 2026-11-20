import { useEffect, useRef } from 'react'
import styles from './RangeField.module.css'

/**
 * A slider that reports every movement (`onPreview`) and, separately, the value it was
 * released at (`onCommit`, the native `change` event, which React's onChange does not
 * expose). Edits are saved on release (docs/spec.md, section 8).
 */
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onPreview,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format: (value: number) => string
  onPreview: (value: number) => void
  onCommit: (value: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  }, [onCommit])

  useEffect(() => {
    const element = input.current
    if (!element) return
    const onChange = () => commit.current(Number(element.value))
    element.addEventListener('change', onChange)
    return () => element.removeEventListener('change', onChange)
  }, [])

  // Uncontrolled while dragging; follows the saved value otherwise.
  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = String(value)
  }, [value])

  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {label} <output>{format(value)}</output>
      </span>
      <input
        ref={input}
        type="range"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onInput={(event) => onPreview(Number(event.currentTarget.value))}
      />
    </label>
  )
}
