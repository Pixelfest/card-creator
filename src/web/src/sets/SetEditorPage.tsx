import { useEffect } from 'react'
import { isNotFound } from '../api/http'
import { useCollection } from '../collections/api'
import { NameInput } from '../components/NameInput'
import { Link } from '../Link'
import { NotFoundPage } from '../NotFoundPage'
import { paths } from '../router'
import { useSet, useSetMutations } from './api'
import styles from './SetEditorPage.module.css'

/**
 * The Set editor (docs/spec.md, section 7). This is the shell: header, and placeholder areas
 * for the card list, the card and the properties panel, which later slices fill in.
 */
export function SetEditorPage({ collectionId, setId }: { collectionId: string; setId: string }) {
  const collection = useCollection(collectionId)
  const set = useSet(collectionId, setId)
  const { rename } = useSetMutations(collectionId)

  useEffect(() => {
    if (set.data) document.title = set.data.name
  }, [set.data])

  if (isNotFound(set.error)) {
    return <NotFoundPage message="There is no set at this link. Check that you copied all of it." />
  }

  return (
    <div className={styles.editor}>
      <header className={styles.header}>
        <Link href={paths.collection(collectionId)} className={styles.back}>
          ← {collection.data?.name ?? 'Collection'}
        </Link>
        {set.data && (
          <NameInput
            value={set.data.name}
            label="Set name"
            className={styles.name}
            onCommit={(name) => rename.mutateAsync({ setId, name })}
          />
        )}
        {set.isPending && <span className={styles.hint}>Loading…</span>}
        {set.isError && (
          <span role="alert" className={styles.error}>
            Couldn't load the set.{' '}
            <button type="button" onClick={() => set.refetch()}>
              Retry
            </button>
          </span>
        )}
      </header>

      <aside className={styles.cardList} aria-label="Cards">
        <p className={styles.placeholder}>Card list</p>
      </aside>
      <main className={styles.stage} aria-label="Card">
        <div className={styles.cardPlaceholder}>Card</div>
      </main>
      <aside className={styles.properties} aria-label="Properties">
        <p className={styles.placeholder}>Properties</p>
      </aside>
    </div>
  )
}
