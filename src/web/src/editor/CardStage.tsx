import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { artworkUrl } from '../artwork/api'
import { pan, toCardUnits, wheelFactor, zoomAt, type ArtworkRef } from '../render/artwork'
import { CardCanvas } from '../render/CardCanvas'
import { CARD_HEIGHT, fitCard } from '../render/units'
import { useRenderResources } from '../render/useRenderResources'
import { hitsBox } from '../text/layout'
import type { TextResources } from '../text/textResources'
import { useTextResources } from '../text/useTextResources'
import * as actions from './actions'
import styles from './CardStage.module.css'
import { useEditor, useEditorApi } from './editorHooks'
import type { Card, CardDesign, Snippet, SnippetSlot } from './model'
import { MAX_SNIPPET_ZOOM, MIN_SNIPPET_ZOOM, SNIPPET_DRAW_ORDER } from './snippets'

/** How long the wheel must rest before a zoom counts as finished (and is saved). */
const WHEEL_SETTLE_MS = 350
/** Pointer travel (CSS px) below which a press is a click, not a drag. */
const CLICK_SLOP = 3

/** The centre workspace: the selected Card, as large as fits, on a dark background. */
export function CardStage() {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const card = useEditor((s) => s.cards.find((c) => c.id === s.selectedId))
  const preview = useEditor((s) => s.preview)

  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const design = useMemo<CardDesign | undefined>(() => {
    if (!card) return undefined
    return preview?.cardId === card.id ? { ...card.design, ...preview.design } : card.design
  }, [card, preview])

  const padding = 32
  const fit = fitCard(Math.max(0, size.width - padding * 2), Math.max(0, size.height - padding * 2))
  const cssWidth = Math.min(Math.floor(fit.width), 520)

  return (
    <div ref={box} className={styles.stage}>
      {card && design ? (
        <StageCanvas card={card} design={design} cssWidth={cssWidth} />
      ) : (
        <p className={styles.hint}>Add a card to start.</p>
      )}
    </div>
  )
}

/** The topmost snippet whose box contains a point (card units): header, then banner, then textbox. */
function snippetAt(design: CardDesign, text: TextResources, x: number, y: number): SnippetSlot | null {
  for (const slot of [...SNIPPET_DRAW_ORDER].reverse()) {
    const snippet = design.snippets[slot]
    if (snippet && hitsBox(text.layout(snippet), x, y)) return slot
  }
  return null
}

type DragTarget =
  | { kind: 'artwork'; from: ArtworkRef }
  | { kind: 'snippet'; slot: SnippetSlot; from: Snippet }
  | { kind: 'none' }

type Drag = { pointerId: number; startX: number; startY: number; moved: boolean; target: DragTarget }

type PendingWheel = {
  save: () => void
  timer: number
  artwork?: ArtworkRef
  snippet?: { slot: SnippetSlot; value: Snippet }
}

/**
 * The canvas plus direct manipulation. A press on a snippet drags it up or down; elsewhere it
 * pans the Artwork. The wheel zooms the snippet under the pointer, or the Artwork around the
 * pointer. A click selects that part. Everything is previewed live and saved when finished:
 * on release for a drag, once the wheel rests for a zoom. Nothing is drawn until the fonts
 * have loaded, so the fallback font never flashes or gets measured.
 */
function StageCanvas({ card, design, cssWidth }: { card: Card; design: CardDesign; cssWidth: number }) {
  const { collectionId } = useEditorApi()
  const urlFor = useCallback((id: string) => artworkUrl(collectionId, id), [collectionId])
  const images = useRenderResources(design, urlFor)
  const text = useTextResources()
  const resources = useMemo(() => ({ ...images, text }), [images, text])
  const commit = useEditor((s) => s.commit)
  const setPreview = useEditor((s) => s.setPreview)
  const selectPart = useEditor((s) => s.selectPart)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const wheel = useRef<PendingWheel | null>(null)

  const artwork = design.artwork
  const cardId = card.id
  const showArtwork = useCallback((next: ArtworkRef) => setPreview({ cardId, design: { artwork: next } }), [cardId, setPreview])
  const saveArtwork = useCallback((next: ArtworkRef) => commit(actions.updateDesign(cardId, { artwork: next })), [cardId, commit])
  const showSnippet = useCallback(
    (slot: SnippetSlot, next: Snippet) => setPreview({ cardId, design: { snippets: { ...card.design.snippets, [slot]: next } } }),
    [cardId, card.design.snippets, setPreview],
  )
  const saveSnippet = useCallback(
    (slot: SnippetSlot, next: Snippet) => commit(actions.patchSnippet(cardId, slot, { position: next.position, zoom: next.zoom })),
    [cardId, commit],
  )

  function pointInCard(clientX: number, clientY: number) {
    const box = surface.current!.getBoundingClientRect()
    return toCardUnits({ x: clientX - box.left, y: clientY - box.top }, cssWidth)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    try {
      // Keep receiving moves when the pointer leaves the card mid-drag.
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Not an active pointer (synthetic events): the drag still works inside the card.
    }
    const at = pointInCard(event.clientX, event.clientY)
    const slot = text ? snippetAt(design, text, at.x, at.y) : null
    const target: DragTarget = slot
      ? { kind: 'snippet', slot, from: design.snippets[slot]! }
      : artwork
        ? { kind: 'artwork', from: artwork }
        : { kind: 'none' }
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, target }
  }

  /** Where a drag has taken its target. A snippet only moves vertically. */
  function dragged(d: Drag, clientX: number, clientY: number): { artwork?: ArtworkRef; snippet?: Snippet } {
    const delta = toCardUnits({ x: clientX - d.startX, y: clientY - d.startY }, cssWidth)
    if (d.target.kind === 'artwork') return { artwork: pan(d.target.from, delta.x, delta.y) }
    if (d.target.kind === 'snippet') {
      const position = Math.min(100, Math.max(0, d.target.from.position + (delta.y / CARD_HEIGHT) * 100))
      return { snippet: { ...d.target.from, position } }
    }
    return {}
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.pointerId !== event.pointerId || d.target.kind === 'none') return
    if (!d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < CLICK_SLOP) return
    d.moved = true
    const next = dragged(d, event.clientX, event.clientY)
    if (next.artwork) showArtwork(next.artwork)
    if (next.snippet && d.target.kind === 'snippet') showSnippet(d.target.slot, next.snippet)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.pointerId !== event.pointerId) return
    drag.current = null
    if (d.moved) {
      const next = dragged(d, event.clientX, event.clientY)
      if (next.artwork) saveArtwork(next.artwork)
      if (next.snippet && d.target.kind === 'snippet') saveSnippet(d.target.slot, next.snippet)
    } else {
      // A click selects the part under the pointer.
      selectPart(d.target.kind === 'snippet' ? d.target.slot : artwork ? 'artwork' : 'card')
    }
  }

  // The wheel needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const element = surface.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const box = element.getBoundingClientRect()
      const at = toCardUnits({ x: event.clientX - box.left, y: event.clientY - box.top }, cssWidth)
      const pending = wheel.current
      // Keep zooming whatever the current wheel gesture started on.
      const slot = pending ? (pending.snippet?.slot ?? null) : text ? snippetAt(design, text, at.x, at.y) : null
      const factor = wheelFactor(event.deltaY)

      let next: Omit<PendingWheel, 'timer'>
      if (slot) {
        const current = pending?.snippet?.value ?? design.snippets[slot]!
        const zoom = Math.min(MAX_SNIPPET_ZOOM, Math.max(MIN_SNIPPET_ZOOM, current.zoom * factor))
        const value = { ...current, zoom }
        showSnippet(slot, value)
        next = { snippet: { slot, value }, save: () => saveSnippet(slot, value) }
      } else {
        const current = pending?.artwork ?? artwork
        if (!current) return
        const value = zoomAt(current, factor, at)
        showArtwork(value)
        next = { artwork: value, save: () => saveArtwork(value) }
      }
      event.preventDefault()
      if (pending) window.clearTimeout(pending.timer)
      wheel.current = {
        ...next,
        timer: window.setTimeout(() => {
          wheel.current = null
          next.save()
        }, WHEEL_SETTLE_MS),
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [artwork, design, text, cssWidth, showArtwork, saveArtwork, showSnippet, saveSnippet])

  // Switching Card mid-zoom still saves the zoom on the Card it belongs to.
  useEffect(
    () => () => {
      if (wheel.current) {
        window.clearTimeout(wheel.current.timer)
        wheel.current.save()
        wheel.current = null
      }
    },
    [cardId],
  )

  if (!text) return <p className={styles.hint}>Loading fonts…</p>

  const movable = !!artwork || Object.keys(design.snippets).length > 0
  return (
    <div
      ref={surface}
      className={`${styles.card} ${movable ? styles.movable : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <CardCanvas design={design} resources={resources} cssWidth={cssWidth} label={`Preview of ${card.name}`} />
    </div>
  )
}
