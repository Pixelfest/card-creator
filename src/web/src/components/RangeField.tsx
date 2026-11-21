import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import styles from './RangeField.module.css'
import ui from '../ui/ui.module.css'

/**
 * A slider that reports every movement (`onPreview`) and, separately, the value it was
 * released at (`onCommit`, the native `change` event, which React's onChange does not
 * expose). Edits are saved on release (docs/spec.md, section 8). With `editable` there is also
 * a number box: typing previews, leaving the box or pressing Enter commits the clamped value.
 */
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  editable = false,
  onPreview,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format: (value: number) => string
  /** Also show a number box, for typing the value. */
  editable?: boolean
  onPreview: (value: number) => void
  onCommit: (value: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const [typed, setTyped] = useState<string | null>(null)
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

  const slider = (ariaLabel?: string) => (
    <input
      ref={input}
      type="range"
      min={min}
      max={max}
      step={step}
      defaultValue={value}
      aria-label={ariaLabel}
      onInput={(event: FormEvent<HTMLInputElement>) => onPreview(Number(event.currentTarget.value))}
    />
  )

  if (editable) {
    const finish = () => {
      const n = Number(typed)
      if (typed !== null && typed.trim() !== '' && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)))
      setTyped(null)
    }
    return (
      <div className={`${ui.field} ${styles.range}`}>
        <div className={styles.label}>
          <label htmlFor={`${id}-number`}>{label}</label>
          <span className={styles.number}>
            <input
              id={`${id}-number`}
              type="number"
              min={min}
              max={max}
              step={step}
              value={typed ?? String(value)}
              onChange={(event) => {
                setTyped(event.target.value)
                const n = Number(event.target.value)
                if (event.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onPreview(n)
              }}
              onBlur={finish}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
            {unitOf(format(value))}
          </span>
        </div>
        {slider(`${label} slider`)}
      </div>
    )
  }

  return (
    <label className={`${ui.field} ${styles.range}`}>
      <span className={styles.label}>
        {label} <output>{format(value)}</output>
      </span>
      {slider()}
    </label>
  )
}

/** The unit after the number in a formatted value: "8%" becomes "%". */
function unitOf(formatted: string): string {
  return formatted.replace(/^[\d.,\s-]+/, '')
}
