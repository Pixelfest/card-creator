import { useAssets } from '../assets/api'
import { missingAssetWarnings } from '../render/warnings'
import * as actions from './actions'
import { useEditor } from './editorHooks'
import styles from './FrameProperties.module.css'
import ui from '../ui/ui.module.css'

/**
 * The Back part: tiles from the asset library's backs, plus "None". A Card with a Back makes
 * the PDF double-sided (docs/spec.md, section 10). The editor never draws the Back on the stage.
 */
export function BackProperties() {
  const card = useEditor((s) => s.cards.find((c) => c.id === s.selectedId))
  const commit = useEditor((s) => s.commit)
  const assets = useAssets()

  if (!card) return null
  const current = card.design.back ?? null
  const warning = missingAssetWarnings(card.design, assets.data).find((w) => w.part === 'back')
  const pick = (back: string | null) => commit(actions.updateDesign(card.id, { back }))

  return (
    <div className={styles.wrapper}>
      {warning && (
        <p role="note" className={ui.warning}>
          ⚠ {warning.message} It prints blank. Pick another Back.
        </p>
      )}
      {assets.isPending && <p className={ui.hint}>Loading backs…</p>}
      {assets.isError && <p className={ui.hint}>Couldn't load the backs.</p>}
      <div className={styles.tiles} role="radiogroup" aria-label="Back">
        <button
          type="button"
          role="radio"
          aria-checked={current === null}
          className={ui.tile}
          onClick={() => pick(null)}
        >
          <span className={`${ui.checker} ${styles.thumb} ${ui.none}`} aria-hidden="true" />
          None
        </button>
        {assets.data?.backs.map((back) => (
          <button
            key={back.path}
            type="button"
            role="radio"
            aria-checked={current === back.path}
            className={ui.tile}
            onClick={() => pick(back.path)}
          >
            <img className={`${ui.checker} ${styles.thumb} ${styles.cover}`} src={back.url} alt="" loading="lazy" />
            {back.displayName}
          </button>
        ))}
      </div>
      {assets.data && assets.data.backs.length === 0 && <p className={ui.hint}>No Backs are available yet.</p>}
      <p className={ui.hint}>With a Back on any printed Card, the PDF is double-sided: fronts on odd pages, Backs on even pages.</p>
    </div>
  )
}
