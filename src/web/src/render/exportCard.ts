import type { CardDesign } from '../editor/model'
import { renderCard, type RenderResources } from './renderCard'
import { CUT_BORDER_PX, EXPORT_TARGET } from './units'

/** The print PNG's size: the Card at 520×850 plus a white cut border on every side (568×898). */
export const PRINT_SIZE = {
  width: EXPORT_TARGET.width + 2 * CUT_BORDER_PX,
  height: EXPORT_TARGET.height + 2 * CUT_BORDER_PX,
}

function canvas(width: number, height: number): CanvasRenderingContext2D {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  const ctx = element.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw on a canvas.')
  return ctx
}

/**
 * Renders one Card for print at 300 DPI, whatever the screen's devicePixelRatio: the Card at
 * 520×850 px, the same renderer as the preview, centred on a white 568×898 px PNG so the
 * 2 mm border to cut in is part of the image.
 */
export async function renderCardToPng(design: CardDesign, resources: RenderResources): Promise<Blob> {
  const card = canvas(EXPORT_TARGET.width, EXPORT_TARGET.height)
  renderCard(card, design, resources, EXPORT_TARGET)

  const print = canvas(PRINT_SIZE.width, PRINT_SIZE.height)
  print.fillStyle = '#ffffff'
  print.fillRect(0, 0, PRINT_SIZE.width, PRINT_SIZE.height)
  print.drawImage(card.canvas, CUT_BORDER_PX, CUT_BORDER_PX)

  return new Promise((resolve, reject) =>
    print.canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the card as PNG.'))),
      'image/png',
    ),
  )
}
