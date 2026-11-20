import type { CardDesign } from '../editor/model'
import { renderCard, type RenderResources } from './renderCard'
import { EXPORT_TARGET } from './units'

/**
 * Renders one Card for print: 520×850 px (300 DPI), whatever the screen's devicePixelRatio.
 * The same renderer as the preview, only the target differs.
 */
export async function renderCardToPng(design: CardDesign, resources: RenderResources): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = EXPORT_TARGET.width
  canvas.height = EXPORT_TARGET.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw on a canvas.')
  renderCard(ctx, design, resources, EXPORT_TARGET)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the card as PNG.'))), 'image/png'),
  )
}
