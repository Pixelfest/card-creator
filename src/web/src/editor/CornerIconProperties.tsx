import { useAssets } from '../assets/api'
import { RangeField } from '../components/RangeField'
import {
  CORNER_LABELS,
  CORNERS,
  cornerIconsOf,
  MAX_ICON_INSET,
  MAX_ICON_SIZE,
  MIN_ICON_SIZE,
  type Corner,
  type CornerIcons,
} from '../render/cornerIcons'
import { missingAssetWarnings } from '../render/warnings'
import * as actions from './actions'
import styles from './CornerIconProperties.module.css'
import { useEditor } from './editorHooks'

const percent = (value: number) => `${Math.round(value * 10) / 10}%`

/**
 * The Corner icons part: one icon from the library, the corners that show it, and one size and
 * pair of offsets shared by all of them. Sliders preview while held and save on release.
 */
export function CornerIconProperties() {
  const card = useEditor((s) => s.cards.find((c) => c.id === s.selectedId))
  const preview = useEditor((s) => s.preview)
  const commit = useEditor((s) => s.commit)
  const setPreview = useEditor((s) => s.setPreview)
  const assets = useAssets()

  if (!card) return null
  const cardId = card.id
  const settings = (preview?.cardId === cardId && preview.design.cornerIcons) || cornerIconsOf(card.design)
  const warning = missingAssetWarnings(card.design, assets.data).find((w) => w.part === 'cornerIcons')

  const save = (patch: Partial<CornerIcons>) =>
    commit(actions.updateDesign(cardId, { cornerIcons: { ...settings, ...patch } }))
  const show = (patch: Partial<CornerIcons>) => setPreview({ cardId, design: { cornerIcons: { ...settings, ...patch } } })
  const toggle = (corner: Corner) =>
    save({
      corners: settings.corners.includes(corner)
        ? settings.corners.filter((c) => c !== corner)
        : [...settings.corners, corner],
    })

  function slider(label: string, key: 'size' | 'insetY' | 'insetX', min: number, max: number) {
    return (
      <RangeField
        label={label}
        value={settings[key]}
        min={min}
        max={max}
        step={0.5}
        editable
        format={percent}
        onPreview={(value) => show({ [key]: value })}
        onCommit={(value) => save({ [key]: value })}
      />
    )
  }

  return (
    <div className={styles.wrapper}>
      {warning && (
        <p role="note" className={styles.warning}>
          ⚠ {warning.message} Nothing is drawn. Pick another icon.
        </p>
      )}
      {assets.isPending && <p className={styles.hint}>Loading icons…</p>}
      {assets.isError && <p className={styles.hint}>Couldn't load the icons.</p>}

      <div className={styles.tiles} role="radiogroup" aria-label="Icon">
        <button
          type="button"
          role="radio"
          aria-checked={settings.icon === null}
          className={styles.tile}
          onClick={() => save({ icon: null })}
        >
          <span className={`${styles.thumb} ${styles.none}`} aria-hidden="true" />
          None
        </button>
        {assets.data?.icons.map((icon) => (
          <button
            key={icon.path}
            type="button"
            role="radio"
            aria-checked={settings.icon === icon.path}
            className={styles.tile}
            onClick={() => save({ icon: icon.path })}
          >
            <img className={styles.thumb} src={icon.url} alt="" loading="lazy" />
            {icon.displayName}
          </button>
        ))}
      </div>
      {assets.data && assets.data.icons.length === 0 && <p className={styles.hint}>There are no icons in the library.</p>}

      <fieldset className={styles.corners}>
        <legend>Corners</legend>
        {CORNERS.map((corner) => (
          <label key={corner}>
            <input type="checkbox" checked={settings.corners.includes(corner)} onChange={() => toggle(corner)} />
            {CORNER_LABELS[corner]}
          </label>
        ))}
      </fieldset>

      {slider('Size', 'size', MIN_ICON_SIZE, MAX_ICON_SIZE)}
      {slider('Distance from top/bottom', 'insetY', 0, MAX_ICON_INSET)}
      {slider('Distance from sides', 'insetX', 0, MAX_ICON_INSET)}
      <small className={styles.hint}>
        Size is a percentage of the card width; distances are measured from the card edge. All ticked corners share them.
      </small>
    </div>
  )
}
