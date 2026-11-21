import type { CardDesign } from '../editor/model'
import { renderCard, type RenderResources } from './renderCard'
import { CARD_MM, CARD_HEIGHT, CARD_WIDTH, CUT_BORDER_MM, type RenderTarget } from './units'

/**
 * The print PNG for a Card printed `cardWidthMm` wide: the Card rendered at `target` with a white
 * cut border of `border` px on every side, `width` × `height` px in all. The Card renders at
 * 520×850 (300 DPI at 44 mm) or, when printed larger, scaled up so it stays at least 300 DPI.
 * The border is 2 mm at the Card's resolution. At 44 mm this is 520×850 plus 24 px: 568×898.
 */
export type PrintImage = { target: RenderTarget; border: number; width: number; height: number }

export function printImage(cardWidthMm: number = CARD_MM.width): PrintImage {
  const width = Math.round(CARD_WIDTH * Math.max(1, cardWidthMm / CARD_MM.width))
  const scale = width / CARD_WIDTH
  const target = { width, height: Math.round(CARD_HEIGHT * scale), scale }
  const border = Math.round((CUT_BORDER_MM * width) / cardWidthMm)
  return { target, border, width: target.width + 2 * border, height: target.height + 2 * border }
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
 * Renders one Card for print at its `printImage` size, whatever the screen's devicePixelRatio:
 * the same renderer as the preview, centred on a white PNG so the 2 mm border to cut in is part
 * of the image.
 */
export async function renderCardToPng(
  design: CardDesign,
  resources: RenderResources,
  image: PrintImage = printImage(),
): Promise<Blob> {
  const card = canvas(image.target.width, image.target.height)
  renderCard(card, design, resources, image.target)

  const print = canvas(image.width, image.height)
  print.fillStyle = '#ffffff'
  print.fillRect(0, 0, image.width, image.height)
  print.drawImage(card.canvas, image.border, image.border)

  return new Promise((resolve, reject) =>
    print.canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the card as PNG.'))),
      'image/png',
    ),
  )
}
