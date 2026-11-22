import { useCallback, useState } from 'react'
import { artworkUrl } from '../artwork/api'
import { useAssets } from '../assets/api'
import { Dialog } from '../components/ConfirmDialog'
import { useOnline } from '../components/useOnline'
import { useEditor, useEditorApi } from '../editor/editorHooks'
import { cardWarnings } from '../render/warnings'
import { useTextResources } from '../text/useTextResources'
import styles from './ExportDialog.module.css'
import ui from '../ui/ui.module.css'
import {
  CARD_MM,
  CARD_WIDTH_RANGE_MM,
  expandCopies,
  exportFileName,
  pageCount,
  parseCardWidth,
  printLayout,
} from './layout'
import type { ExportProgress } from './render'

/** The editor header's **Export…** button; disabled while offline (spec section 11). */
export function ExportButton({ setName }: { setName: string }) {
  const online = useOnline()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        disabled={!online}
        title={online ? undefined : 'Export needs a connection.'}
        onClick={() => setOpen(true)}
      >
        Export…
      </button>
      {open && <ExportDialog setName={setName} onClose={() => setOpen(false)} />}
    </>
  )
}

/** The last printed Card width, remembered in this browser only. */
const CARD_WIDTH_KEY = 'cardCreator.export.cardWidthMm'

function storedCardWidth(): string {
  try {
    const stored = window.localStorage.getItem(CARD_WIDTH_KEY)
    if (stored && parseCardWidth(stored) !== undefined) return stored
  } catch {
    // Storage blocked: use the default.
  }
  return String(CARD_MM.width)
}

function storeCardWidth(width: number) {
  try {
    window.localStorage.setItem(CARD_WIDTH_KEY, String(width))
  } catch {
    // Not remembered; the export still works.
  }
}

/** One decimal at most: 44, 63.5, 72.4. */
const mm = (value: number) => String(Math.round(value * 10) / 10)

type Phase ={ kind: 'choose' } | { kind: 'exporting'; progress: ExportProgress } | { kind: 'failed'; message: string }

/**
 * Export (docs/spec.md, section 10): pick Cards and a print size, see the totals and the warnings
 * for the picked Cards, then render and download `{Set name}.pdf`.
 */
export function ExportDialog({ setName, onClose }: { setName: string; onClose: () => void }) {
  const cards = useEditor((s) => s.cards)
  const { collectionId } = useEditorApi()
  const manifest = useAssets().data
  const text = useTextResources()
  const online = useOnline()
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(cards.filter((c) => c.copies > 0).map((c) => c.id)),
  )
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' })
  const [widthInput, setWidthInput] = useState(storedCardWidth)

  const cardWidth = parseCardWidth(widthInput)
  const layout = printLayout(cardWidth ?? CARD_MM.width)
  const printable = cards.filter((c) => c.copies > 0)
  const cardCount = expandCopies(cards, selected).length
  const pages = pageCount(cardCount, layout.perPage)
  const warnings = text
    ? cards
        .filter((c) => selected.has(c.id) && c.copies > 0)
        .flatMap((card) => cardWarnings(card.design, manifest, text).map((w) => ({ card, ...w })))
    : []

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const setAll = (on: boolean) => setSelected(new Set(on ? printable.map((c) => c.id) : []))

  const exporting = phase.kind === 'exporting'
  const close = useCallback(() => {
    if (!exporting) onClose()
  }, [exporting, onClose])

  async function run() {
    if (!text || cardWidth === undefined) return
    storeCardWidth(cardWidth)
    setPhase({ kind: 'exporting', progress: { done: 0, total: 1 } })
    try {
      // Loaded on first export: `pdf-lib` is large and only needed here.
      const [{ download }, { exportPdf: build }] = await Promise.all([import('./render'), import('./pdf')])
      const blob = await build({
        cards,
        selected,
        manifest,
        text,
        artworkUrl: (id) => artworkUrl(collectionId, id),
        layout,
        onProgress: (progress) => setPhase({ kind: 'exporting', progress }),
      })
      download(blob, exportFileName(setName))
      onClose()
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` ${error.message}` : ''
      setPhase({ kind: 'failed', message: `The export failed.${detail} Nothing was downloaded.` })
    }
  }

  const ready = !!text && cardCount > 0 && online && cardWidth !== undefined
  const label = phase.kind === 'failed' ? 'Retry' : warnings.length > 0 ? 'Export anyway' : 'Export'

  return (
    <Dialog
      title="Export"
      wide
      dismissible={!exporting}
      onCancel={close}
      buttons={
        <>
          <button type="button" onClick={close} disabled={exporting}>
            Cancel
          </button>
          <button type="button" className={ui.primary} onClick={run} disabled={!ready || exporting}>
            {label}
          </button>
        </>
      }
    >
      <fieldset className={styles.cards} disabled={exporting}>
        <legend className={styles.legend}>
          Cards
          <span className={styles.all}>
            <button type="button" onClick={() => setAll(true)}>
              All
            </button>
            <button type="button" onClick={() => setAll(false)}>
              None
            </button>
          </span>
        </legend>
        <ul className={styles.list}>
          {cards.map((card) => (
            <li key={card.id}>
              <label className={card.copies > 0 ? undefined : styles.disabled}>
                <input
                  type="checkbox"
                  checked={card.copies > 0 && selected.has(card.id)}
                  disabled={card.copies <= 0}
                  onChange={() => toggle(card.id)}
                />
                <span className={styles.name}>{card.name}</span>
                <span className={styles.copies}>× {card.copies}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className={styles.size} disabled={exporting}>
        <legend className={styles.legend}>Print size</legend>
        <label>
          Width
          <input
            type="number"
            inputMode="decimal"
            min={CARD_WIDTH_RANGE_MM.min}
            max={CARD_WIDTH_RANGE_MM.max}
            step={0.5}
            value={widthInput}
            aria-invalid={cardWidth === undefined}
            aria-describedby="export-card-size"
            onChange={(e) => setWidthInput(e.target.value)}
          />
          mm
        </label>
        <span>× {mm(layout.cardMm.height)} mm high</span>
        {widthInput !== String(CARD_MM.width) && (
          <button type="button" onClick={() => setWidthInput(String(CARD_MM.width))}>
            Reset to {CARD_MM.width} mm
          </button>
        )}
        <p id="export-card-size" className={cardWidth === undefined ? ui.error : styles.muted}>
          {cardWidth === undefined
            ? `Enter a width from ${CARD_WIDTH_RANGE_MM.min} to ${CARD_WIDTH_RANGE_MM.max} mm.`
            : `${layout.perPage} per page (${layout.columns} × ${layout.rows}), A4 ${layout.orientation}`}
        </p>
      </fieldset>

      <p className={styles.totals} aria-live="polite">
        {cardCount} {cardCount === 1 ? 'card' : 'cards'} on {pages} {pages === 1 ? 'page' : 'pages'}
      </p>

      {!text && <p className={styles.muted}>Loading fonts…</p>}

      {warnings.length > 0 && (
        <div className={`${ui.warning} ${styles.warnings}`} role="status">
          <p>
            <strong>⚠ Check these before printing:</strong>
          </p>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>
                <span className={styles.name}>{w.card.name}</span>: {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className={styles.reminder}>Print at 100% / Actual size: don't use Fit to page.</p>

      {!online && <p role="alert">You're offline. Export needs a connection.</p>}

      {phase.kind === 'exporting' && (
        <progress
          className={styles.progress}
          aria-label="Export progress"
          value={phase.progress.done}
          max={phase.progress.total}
        />
      )}
      {phase.kind === 'failed' && (
        <p role="alert" className={ui.error}>
          {phase.message}
        </p>
      )}
    </Dialog>
  )
}
