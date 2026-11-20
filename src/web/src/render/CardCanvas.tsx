import { useEffect, useRef, useState } from 'react'
import type { CardDesign } from '../editor/model'
import { renderCard, type RenderResources } from './renderCard'
import { CARD_ASPECT, previewTarget } from './units'

/** The current devicePixelRatio, updated when it changes (browser zoom, another monitor). */
function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1)
  useEffect(() => {
    const query = window.matchMedia?.(`(resolution: ${dpr}dppx)`)
    if (!query) return
    const onChange = () => setDpr(window.devicePixelRatio || 1)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [dpr])
  return dpr
}

/** The editor preview of one Card, `cssWidth` CSS pixels wide and sharp at any DPR. */
export function CardCanvas({
  design,
  resources,
  cssWidth,
  label,
}: {
  design: CardDesign
  resources: RenderResources
  cssWidth: number
  label: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const dpr = useDevicePixelRatio()

  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx || cssWidth <= 0) return
    const target = previewTarget(cssWidth, dpr)
    if (element.width !== target.width) element.width = target.width
    if (element.height !== target.height) element.height = target.height
    renderCard(ctx, design, resources, target)
  }, [design, resources, cssWidth, dpr])

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      style={{ width: cssWidth, height: cssWidth / CARD_ASPECT, display: 'block' }}
    />
  )
}
