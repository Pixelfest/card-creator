import { Footer } from '../components/Footer'
import { useEffect, useState } from 'react'
import { useCollectionCreation, useCreateCollection } from '../collections/api'
import { loadRecent, openedLabel } from '../collections/recentCollections'
import { Link } from '../Link'
import { navigate, paths } from '../router'
import styles from './HomePage.module.css'

export function HomePage() {
  const creation = useCollectionCreation()
  const create = useCreateCollection()
  const [recent] = useState(loadRecent)
  const [now] = useState(() => new Date())

  useEffect(() => {
    document.title = 'Card Creator'
  }, [])

  function createCollection() {
    create.mutate(undefined, {
      onSuccess: (collection) => navigate(paths.collection(collection.id)),
    })
  }

  return (
    <>
    <main className={styles.page}>
      <h1>Card Creator</h1>

      {creation.data?.allowed && (
        <div>
          <button
            type="button"
            className={styles.newCollection}
            onClick={createCollection}
            disabled={create.isPending}
          >
            + New collection
          </button>
          {create.isError && (
            <p role="alert" className={styles.error}>
              Couldn't create the collection. Try again.
            </p>
          )}
        </div>
      )}
      {creation.data && !creation.data.allowed && (
        <p className={styles.note}>
          Creating collections is restricted. Ask the owner for a collection link.
        </p>
      )}

      <section>
        <h2>Recently opened</h2>
        <p className={styles.hint}>Remembered in this browser only.</p>
        {recent.length === 0 ? (
          <p className={styles.hint}>Nothing yet.</p>
        ) : (
          <ul className={styles.recent}>
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={paths.collection(r.id)}>{r.name}</Link>{' '}
                <span className={styles.hint}>{openedLabel(r.openedAt, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
      <Footer />
    </>
  )
}
