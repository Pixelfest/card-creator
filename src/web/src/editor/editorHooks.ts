import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import type { Editor, EditorState } from './store'

export const EditorContext = createContext<Editor | null>(null)

export function useEditorApi(): Editor {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error('useEditorApi must be used inside an EditorProvider')
  return editor
}

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorApi().store, selector)
}
