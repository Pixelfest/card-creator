import { useEffect, useState, type ReactNode } from 'react'
import { httpCardsApi } from './cardsApi'
import type { ServerCard } from './model'
import { EditorContext } from './editorHooks'
import { createEditor } from './store'

/**
 * One editor per Set: its Cards, selection and save queue. Wires the page lifecycle in:
 * re-fetch on tab focus, the leave-page warning while unsaved, and a flush on page leave.
 */
export function EditorProvider({
  collectionId,
  setId,
  initial,
  children,
}: {
  collectionId: string
  setId: string
  initial: ServerCard[]
  children: ReactNode
}) {
  const [editor] = useState(() => createEditor({ collectionId, setId, api: httpCardsApi(collectionId, setId), initial }))

  useEffect(() => {
    const { saver } = editor
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (saver.dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const flush = () => saver.flush()
    const refresh = () => saver.refresh()
    const onVisibility = () => (document.visibilityState === 'hidden' ? flush() : refresh())

    window.addEventListener('beforeunload', warnIfUnsaved)
    window.addEventListener('pagehide', flush)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', warnIfUnsaved)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [editor])

  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
}
