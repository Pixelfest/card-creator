import type { Card, CardDesign } from './model'
import type { EditorState } from './store'

export function selectedCard(state: EditorState): Card | undefined {
  return state.cards.find((c) => c.id === state.selectedId)
}

/** The selected Card's design as it should be drawn: with any unfinished change on top. */
export function displayedDesign(state: EditorState): CardDesign | undefined {
  const card = selectedCard(state)
  if (!card) return undefined
  const preview = state.preview
  return preview && preview.cardId === card.id ? { ...card.design, ...preview.design } : card.design
}
