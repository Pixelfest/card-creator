import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { fetchJson } from '../api/http'
import { artworkUrl } from '../artwork/api'
import { NameInput } from '../components/NameInput'
import { lastChangedLabel } from '../dates'
import type { ServerCard } from '../editor/model'
import { Link } from '../Link'
import { CardCanvas } from '../render/CardCanvas'
import { useRenderResources } from '../render/useRenderResources'
import { paths } from '../router'
import { useTextResources } from '../text/useTextResources'
import ui from '../ui/ui.module.css'
import { useSetMutations, useSets, type CardSet } from './api'
import { DeleteSetDialog } from './DeleteSetDialog'
import styles from './SetTiles.module.css'

const THUMBNAIL_WIDTH = 96

/** The Collection page's Sets as tiles: a thumbnail of the first Card, rename in place, Open, Duplicate, Delete. */
export function SetTiles({ collectionId }: { collectionId: string }) {
  const sets = useSets(collectionId)
  const { rename, duplicate } = useSetMutations(collectionId)
  const [deleting, setDeleting] = useState<CardSet | null>(null)
  const [now] = useState(() => new Date())

  if (sets.isPending) return <p className={ui.hint}>Loading sets…</p>
  if (sets.isError) {
    return (
      <p role="alert" className={ui.error}>
        Couldn't load the sets.{' '}
        <button type="button" onClick={() => sets.refetch()}>
          Retry
        </button>
      </p>
    )
  }
  if (sets.data.length === 0) return <p className={ui.hint}>No sets yet.</p>

  return (
    <>
      <ul className={styles.tiles} aria-label="Sets">
        {sets.data.map((set) => (
          <li key={set.id} className={styles.tile}>
            <Link href={paths.set(collectionId, set.id)} className={styles.preview} tabIndex={-1} aria-hidden="true">
              <Thumbnail collectionId={collectionId} set={set} />
            </Link>
            <div className={styles.body}>
              <NameInput
                value={set.name}
                label={`Name of set ${set.name}`}
                className={styles.name}
                onCommit={(name) => rename.mutateAsync({ setId: set.id, name })}
              />
              <p className={ui.hint}>
                {set.cardCount === 1 ? '1 card' : `${set.cardCount} cards`} · {lastChangedLabel(set.updatedAt, now)}
              </p>
              <div className={styles.actions}>
                <Link href={paths.set(collectionId, set.id)} aria-label={`Open ${set.name}`} className={styles.open}>
                  Open
                </Link>
                <button
                  type="button"
                  onClick={() => duplicate.mutate(set.id)}
                  disabled={duplicate.isPending}
                  aria-label={`Duplicate ${set.name}`}
                  title="Duplicate"
                >
                  ⧉
                </button>
                <button
                  type="button"
                  className={ui.dangerText}
                  onClick={() => setDeleting(set)}
                  aria-label={`Delete ${set.name}`}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {duplicate.isError && (
        <p role="alert" className={ui.error}>
          Couldn't duplicate the set. Try again.
        </p>
      )}
      {deleting && (
        <DeleteSetDialog
          collectionId={collectionId}
          set={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}

/** The Set's first Card, small; an empty Set shows a blank card. */
function Thumbnail({ collectionId, set }: { collectionId: string; set: CardSet }) {
  const cards = useQuery({
    // Not the editor's key: the editor keeps its own copy and must always fetch fresh.
    queryKey: ['collection', collectionId, 'sets', set.id, 'thumbnail'],
    queryFn: () => fetchJson<ServerCard[]>(`/api/collections/${collectionId}/sets/${set.id}/cards`),
    enabled: set.cardCount > 0,
  })
  const first = cards.data?.reduce<ServerCard | undefined>((a, c) => (!a || c.position < a.position ? c : a), undefined)

  if (!first) return <span className={styles.blank} />
  return <CardThumbnail collectionId={collectionId} card={first} />
}

function CardThumbnail({ collectionId, card }: { collectionId: string; card: ServerCard }) {
  const urlFor = useCallback((id: string) => artworkUrl(collectionId, id), [collectionId])
  const images = useRenderResources(card.design, urlFor)
  const text = useTextResources()
  const resources = useMemo(() => ({ ...images, text }), [images, text])
  return <CardCanvas design={card.design} resources={resources} cssWidth={THUMBNAIL_WIDTH} label={`Preview of ${card.name}`} />
}
