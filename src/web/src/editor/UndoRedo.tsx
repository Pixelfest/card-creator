import { useEffect } from 'react'
import { useEditor } from './editorHooks'
import { isTextField, shortcutFor } from './shortcuts'
import styles from './UndoRedo.module.css'

/** Undo / Redo in the header, plus Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z outside text fields. */
export function UndoRedo() {
  const canUndo = useEditor((s) => s.history.past.length > 0)
  const canRedo = useEditor((s) => s.history.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = shortcutFor(event)
      if (!action || isTextField(event.target)) return
      event.preventDefault()
      if (action === 'undo') undo()
      else redo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  return (
    <div className={styles.group}>
      <button type="button" onClick={undo} disabled={!canUndo} aria-keyshortcuts="Control+Z">
        ↶ Undo
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} aria-keyshortcuts="Control+Y Control+Shift+Z">
        ↷ Redo
      </button>
    </div>
  )
}
