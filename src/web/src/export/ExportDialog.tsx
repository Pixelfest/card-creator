import { useCallback, useState } from 'react'
import { artworkUrl } from '../artwork/api'
import { useAssets } from '../assets/api'
import { Dialog } from '../components/ConfirmDialog'
import dialogStyles from '../components/ConfirmDialog.module.css'
import { useOnline } from '../components/useOnline'
import { useEditor, useEditorApi } from '../editor/editorHooks'
import { cardWarnings } from '../render/warnings'
import { useTextResources } from '../text/useTextResources'
import type { ExportProgress } from './docx'
import styles from './ExportDialog.module.css'
import { docxFileName, expandCopies, pageCount } from './layout'

/** The editor header's **Export to Word…** button; disabled while offline (spec section 11). */
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
        Export to Word…
      </button>
      {open && <ExportDialog setName={setName} onClose={() => setOpen(false)} />}
    </>
  )
}

type Phase = { kind: 'choose' } | { kind: 'exporting'; progress: ExportProgress } | { kind: 'failed'; message: string }

/**
 * Export to Word (docs/spec.md, section 10): pick Cards, see the totals and the warnings for
 * the picked Cards, then render and download `{Set name}.docx`.
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

  const printable = cards.filter((c) => c.copies > 0)
  const cardCount = expandCopies(cards, selected).length
  const pages = pageCount(cardCount)
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
    if (!text) return
    setPhase({ kind: 'exporting', progress: { done: 0, total: 1 } })
    try {
      // Loaded on first export: `docx` is large and only needed here.
      const { download, exportCards } = await import('./docx')
      const blob = await exportCards({
        cards,
        selected,
        manifest,
        text,
        artworkUrl: (id) => artworkUrl(collectionId, id),
        onProgress: (progress) => setPhase({ kind: 'exporting', progress }),
      })
      download(blob, docxFileName(setName))
      onClose()
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` ${error.message}` : ''
      setPhase({ kind: 'failed', message: `The export failed.${detail} Nothing was downloaded.` })
    }
  }

  const ready = !!text && cardCount > 0 && online
  const label = phase.kind === 'failed' ? 'Retry' : warnings.length > 0 ? 'Export anyway' : 'Export'

  return (
    <Dialog
      title="Export to Word"
      wide
      dismissible={!exporting}
      onCancel={close}
      buttons={
        <>
          <button type="button" onClick={close} disabled={exporting}>
            Cancel
          </button>
          <button type="button" className={dialogStyles.primary} onClick={run} disabled={!ready || exporting}>
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

      <p className={styles.totals} aria-live="polite">
        {cardCount} {cardCount === 1 ? 'card' : 'cards'} on {pages} {pages === 1 ? 'page' : 'pages'}
      </p>

      {!text && <p className={styles.muted}>Loading fonts…</p>}

      {warnings.length > 0 && (
        <div className={styles.warnings} role="status">
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
        <p role="alert" className={styles.error}>
          {phase.message}
        </p>
      )}
    </Dialog>
  )
}
