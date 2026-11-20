/** Which history shortcut a key press is: Ctrl/⌘+Z undo; Ctrl/⌘+Y or Ctrl/⌘+Shift+Z redo. */
export function shortcutFor(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !event.shiftKey) return 'redo'
  return null
}

const nonTextInputs = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset', 'file', 'image'])

/** Inside these the browser's own undo applies, so the editor's shortcuts stay out. */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !nonTextInputs.has(target.type)
}
