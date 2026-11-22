import { useAssets } from '../assets/api'
import { missingAssetWarnings } from '../render/warnings'
import * as actions from './actions'
import { useEditor } from './editorHooks'
import styles from './FrameProperties.module.css'
import ui from '../ui/ui.module.css'

/** The Frame part: visual tiles from the asset library, plus "None". */
export function FrameProperties() {
  const card = useEditor((s) => s.cards.find((c) => c.id === s.selectedId))
  const commit = useEditor((s) => s.commit)
  const assets = useAssets()

  if (!card) return null
  const current = card.design.frame
  const warning = missingAssetWarnings(card.design, assets.data).find((w) => w.part === 'frame')
  const pick = (frame: string | null) => commit(actions.updateDesign(card.id, { frame }))

  return (
    <div className={styles.wrapper}>
      {warning && (
        <p role="note" className={ui.warning}>
          ⚠ {warning.message} The card is shown without it. Pick another Frame.
        </p>
      )}
      {assets.isPending && <p className={ui.hint}>Loading frames…</p>}
      {assets.isError && <p className={ui.hint}>Couldn't load the frames.</p>}
      <div className={styles.tiles} role="radiogroup" aria-label="Frame">
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
        {assets.data?.frames.map((frame) => (
          <button
            key={frame.path}
            type="button"
            role="radio"
            aria-checked={current === frame.path}
            className={ui.tile}
            onClick={() => pick(frame.path)}
          >
            <img className={`${ui.checker} ${styles.thumb}`} src={frame.url} alt="" loading="lazy" />
            {frame.displayName}
          </button>
        ))}
      </div>
    </div>
  )
}
