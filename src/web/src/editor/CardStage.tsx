import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CardCanvas } from '../render/CardCanvas'
import { fitCard } from '../render/units'
import { useRenderResources } from '../render/useRenderResources'
import styles from './CardStage.module.css'
import { useEditor } from './editorHooks'
import type { CardDesign } from './model'

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
        <StageCanvas design={design} cssWidth={cssWidth} label={`Preview of ${card.name}`} />
      ) : (
        <p className={styles.hint}>Add a card to start.</p>
      )}
    </div>
  )
}

function StageCanvas({ design, cssWidth, label }: { design: CardDesign; cssWidth: number; label: string }) {
  const resources = useRenderResources(design)
  return (
    <div className={styles.card}>
      <CardCanvas design={design} resources={resources} cssWidth={cssWidth} label={label} />
    </div>
  )
}
