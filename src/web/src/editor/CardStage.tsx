import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { artworkUrl } from '../artwork/api'
import { pan, toCardUnits, wheelFactor, zoomAt, type ArtworkRef } from '../render/artwork'
import { CardCanvas } from '../render/CardCanvas'
import { fitCard } from '../render/units'
import { useRenderResources } from '../render/useRenderResources'
import * as actions from './actions'
import styles from './CardStage.module.css'
import { useEditor, useEditorApi } from './editorHooks'
import type { Card, CardDesign } from './model'

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

/**
 * The canvas plus direct manipulation: drag pans the Artwork, the wheel zooms the part under
 * the pointer, and a click selects the part. Moves are previewed live and saved when
 * finished: on release for a drag, once the wheel rests for a zoom.
 */
function StageCanvas({ card, design, cssWidth }: { card: Card; design: CardDesign; cssWidth: number }) {
  const { collectionId } = useEditorApi()
  const urlFor = useCallback((id: string) => artworkUrl(collectionId, id), [collectionId])
  const resources = useRenderResources(design, urlFor)
  const commit = useEditor((s) => s.commit)
  const setPreview = useEditor((s) => s.setPreview)
  const selectPart = useEditor((s) => s.selectPart)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; startX: number; startY: number; from: ArtworkRef | null; moved: boolean } | null>(null)
  const wheel = useRef<{ artwork: ArtworkRef; timer: number } | null>(null)

  const artwork = design.artwork
  const show = useCallback((next: ArtworkRef) => setPreview({ cardId: card.id, design: { artwork: next } }), [card.id, setPreview])
  const save = useCallback((next: ArtworkRef) => commit(actions.updateDesign(card.id, { artwork: next })), [card.id, commit])

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    try {
      // Keep receiving moves when the pointer leaves the card mid-drag.
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Not an active pointer (synthetic events): the drag still works inside the card.
    }
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, from: artwork, moved: false }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.pointerId !== event.pointerId || !d.from) return
    const dx = event.clientX - d.startX
    const dy = event.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP) return
    d.moved = true
    const delta = toCardUnits({ x: dx, y: dy }, cssWidth)
    show(pan(d.from, delta.x, delta.y))
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.pointerId !== event.pointerId) return
    drag.current = null
    if (d.moved && d.from) {
      const delta = toCardUnits({ x: event.clientX - d.startX, y: event.clientY - d.startY }, cssWidth)
      save(pan(d.from, delta.x, delta.y))
    } else {
      // A click: select the part under the pointer. Snippets (#25) are hit-tested first.
      selectPart(artwork ? 'artwork' : 'card')
    }
  }

  // The wheel needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const element = surface.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const current = wheel.current?.artwork ?? artwork
      if (!current) return
      event.preventDefault()
      const box = element.getBoundingClientRect()
      const at = toCardUnits({ x: event.clientX - box.left, y: event.clientY - box.top }, cssWidth)
      const next = zoomAt(current, wheelFactor(event.deltaY), at)
      show(next)
      if (wheel.current) window.clearTimeout(wheel.current.timer)
      wheel.current = {
        artwork: next,
        timer: window.setTimeout(() => {
          wheel.current = null
          save(next)
        }, WHEEL_SETTLE_MS),
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [artwork, cssWidth, show, save])

  // Switching Card mid-zoom still saves the zoom on the Card it belongs to.
  useEffect(
    () => () => {
      if (wheel.current) {
        window.clearTimeout(wheel.current.timer)
        commit(actions.updateDesign(card.id, { artwork: wheel.current.artwork }))
        wheel.current = null
      }
    },
    [card.id, commit],
  )

  return (
    <div
      ref={surface}
      className={`${styles.card} ${artwork ? styles.movable : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <CardCanvas design={design} resources={resources} cssWidth={cssWidth} label={`Preview of ${card.name}`} />
    </div>
  )
}
