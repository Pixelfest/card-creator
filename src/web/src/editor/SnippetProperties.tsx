import { useState } from 'react'
import { useAssets } from '../assets/api'
import { ColourField } from '../components/ColourField'
import { Dialog } from '../components/ConfirmDialog'
import { RangeField } from '../components/RangeField'
import { cardWarnings } from '../render/warnings'
import { ptToUnits } from '../render/units'
import { familyName } from '../text/fonts'
import { useTextResources } from '../text/useTextResources'
import * as actions from './actions'
import { useEditor } from './editorHooks'
import type { Card, Snippet, SnippetSlot } from './model'
import {
  DEFAULT_OUTLINE_THICKNESS,
  MAX_OUTLINE_THICKNESS,
  MAX_SIZE,
  MAX_SNIPPET_ZOOM,
  MIN_OUTLINE_THICKNESS,
  MIN_SIZE,
  MIN_SNIPPET_ZOOM,
  SLOT_LABELS,
} from './snippets'
import styles from './SnippetProperties.module.css'
import ui from '../ui/ui.module.css'

const ALIGNMENTS: { value: Snippet['align']; label: string; icon: string }[] = [
  { value: 'left', label: 'Align left', icon: '⯇' },
  { value: 'center', label: 'Centre', icon: '≡' },
  { value: 'right', label: 'Align right', icon: '⯈' },
]

/** One Text snippet's properties (docs/spec.md, section 7). */
export function SnippetProperties({ slot }: { slot: SnippetSlot }) {
  const card = useEditor((s) => s.cards.find((c) => c.id === s.selectedId))
  const preview = useEditor((s) => s.preview)
  const commit = useEditor((s) => s.commit)
  const setPreview = useEditor((s) => s.setPreview)
  const manifest = useAssets().data
  const text = useTextResources()
  const [pickingBackground, setPickingBackground] = useState(false)

  if (!card) return null
  const saved = card.design.snippets[slot]
  if (!saved) return null
  // While a slider, picker or drag is held, show its value.
  const snippet = (preview?.cardId === card.id && preview.design.snippets?.[slot]) || saved
  const cardId = card.id

  const show = (patch: Partial<Snippet>) =>
    setPreview({ cardId, design: { snippets: { ...card.design.snippets, [slot]: { ...snippet, ...patch } } } })
  const save = (patch: Partial<Snippet>) => {
    commit(actions.patchSnippet(cardId, slot, patch))
    setPreview(null)
  }

  const currentBackground = manifest?.snippetBackgrounds.find((bg) => bg.path === snippet.background)
  const chooseBackground = (background: string | null) => {
    save({ background })
    setPickingBackground(false)
  }

  const warnings = cardWarnings(card.design, manifest, text).filter((w) => w.part === slot)
  const layout = text?.layout(snippet)
  const shrunkTo = layout?.shrunk && layout.fits ? Math.round((layout.fontSize / ptToUnits(1)) * 10) / 10 : null

  return (
    <div className={styles.fields}>
      {warnings.map((w) => (
        <p key={w.message} role="note" className={ui.warning}>
          ⚠ {w.message}
        </p>
      ))}

      <SnippetText key={`${cardId}:${slot}:${saved.text}`} card={card} slot={slot} value={saved.text} />

      <fieldset className={styles.fonts}>
        <legend>Font</legend>
        <div role="radiogroup" aria-label="Font" className={styles.fontList}>
          {manifest?.fonts.map((font) => (
            <button
              key={font.path}
              type="button"
              role="radio"
              aria-checked={snippet.font === font.path}
              className={`${ui.selectable} ${styles.font}`}
              style={{ fontFamily: `"${familyName(font)}", serif` }}
              disabled={text?.fonts.failed.has(font.path)}
              onClick={() => save({ font: font.path })}
            >
              {font.displayName}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fonts}>
        <legend>Background</legend>
        <div className={styles.currentBackground}>
          {currentBackground ? (
            <img className={`${ui.checker} ${styles.backgroundThumb}`} src={currentBackground.url} alt="" />
          ) : (
            <span className={`${ui.checker} ${styles.backgroundThumb} ${ui.none}`} aria-hidden="true" />
          )}
          <span className={styles.currentName}>{currentBackground?.displayName ?? 'None'}</span>
        </div>
        <button type="button" className={styles.changeBackground} onClick={() => setPickingBackground(true)}>
          Change background
        </button>
        {snippet.background && <small className={ui.hint}>The box takes the background's proportions.</small>}
      </fieldset>
      {pickingBackground && (
        <Dialog
          title="Choose a background"
          wide
          onCancel={() => setPickingBackground(false)}
          buttons={
            <button type="button" onClick={() => setPickingBackground(false)}>
              Close
            </button>
          }
        >
          <div role="radiogroup" aria-label="Background" className={`${styles.backgrounds} ${ui.pickerGrid}`}>
            <button
              type="button"
              role="radio"
              aria-checked={snippet.background === null}
              className={ui.tile}
              onClick={() => chooseBackground(null)}
            >
              <span className={`${ui.checker} ${styles.backgroundThumb} ${ui.none}`} aria-hidden="true" />
              None
            </button>
            {manifest?.snippetBackgrounds.map((bg) => (
              <button
                key={bg.path}
                type="button"
                role="radio"
                aria-checked={snippet.background === bg.path}
                className={ui.tile}
                onClick={() => chooseBackground(bg.path)}
              >
                <img className={`${ui.checker} ${styles.backgroundThumb}`} src={bg.url} alt="" loading="lazy" />
                {bg.displayName}
              </button>
            ))}
          </div>
        </Dialog>
      )}

      <RangeField
        label="Size"
        value={snippet.size}
        min={MIN_SIZE}
        max={MAX_SIZE}
        format={(v) => `${v} pt`}
        onPreview={(size) => show({ size })}
        onCommit={(size) => save({ size })}
      />
      {shrunkTo !== null && <small className={ui.hint}>Shrunk to {shrunkTo} pt to fit.</small>}

      <ColourField
        key={`colour:${cardId}:${slot}:${saved.color}`}
        label="Colour"
        value={saved.color}
        onPreview={(color) => show({ color })}
        onCommit={(color) => save({ color })}
      />

      <div className={styles.outline}>
        <label className={styles.check}>
          <input type="checkbox" checked={snippet.outline} onChange={(e) => save({ outline: e.target.checked })} />
          Outline
        </label>
        <ColourField
          key={`outline:${cardId}:${slot}:${saved.outlineColor}`}
          label="Outline colour"
          value={saved.outlineColor}
          disabled={!snippet.outline}
          onPreview={(outlineColor) => show({ outlineColor })}
          onCommit={(outlineColor) => save({ outlineColor })}
        />
      </div>
      {snippet.outline && (
        <RangeField
          label="Outline thickness"
          value={snippet.outlineThickness ?? DEFAULT_OUTLINE_THICKNESS}
          min={MIN_OUTLINE_THICKNESS}
          max={MAX_OUTLINE_THICKNESS}
          format={(v) => `${v}%`}
          onPreview={(outlineThickness) => show({ outlineThickness })}
          onCommit={(outlineThickness) => save({ outlineThickness })}
        />
      )}

      <div role="radiogroup" aria-label="Alignment" className={styles.align}>
        {ALIGNMENTS.map((a) => (
          <button
            key={a.value}
            type="button"
            role="radio"
            className={ui.selectable}
            aria-checked={snippet.align === a.value}
            aria-label={a.label}
            onClick={() => save({ align: a.value })}
          >
            {a.icon}
          </button>
        ))}
      </div>

      <RangeField
        label="Vertical position"
        value={snippet.position}
        min={0}
        max={100}
        step={0.5}
        format={(v) => `${Math.round(v)}%`}
        onPreview={(position) => show({ position })}
        onCommit={(position) => save({ position })}
      />
      <RangeField
        label="Zoom"
        value={snippet.zoom}
        min={MIN_SNIPPET_ZOOM}
        max={MAX_SNIPPET_ZOOM}
        format={(v) => `${Math.round(v)}%`}
        onPreview={(zoom) => show({ zoom })}
        onCommit={(zoom) => save({ zoom })}
      />
      <small className={ui.hint}>On the card: drag the text up or down, scroll over it to zoom.</small>

      <button type="button" className={ui.dangerText} onClick={() => commit(actions.setSnippet(cardId, slot, null))}>
        Remove {SLOT_LABELS[slot].toLowerCase()}
      </button>
    </div>
  )
}

/** The text, edited freely and saved when the field loses focus. Emoji are allowed. */
function SnippetText({ card, slot, value }: { card: Card; slot: SnippetSlot; value: string }) {
  const commit = useEditor((s) => s.commit)
  const [draft, setDraft] = useState(value)
  return (
    <label className={ui.field}>
      <span>Text</span>
      <textarea
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== value) commit(actions.patchSnippet(card.id, slot, { text: draft }))
        }}
      />
    </label>
  )
}
