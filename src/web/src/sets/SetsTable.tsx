import { useState } from 'react'
import { NameInput } from '../components/NameInput'
import { lastChangedLabel } from '../dates'
import { Link } from '../Link'
import { paths } from '../router'
import { useSetMutations, useSets, type CardSet } from './api'
import { DeleteSetDialog } from './DeleteSetDialog'
import styles from './SetsTable.module.css'

/** The Collection page's table of Sets: rename in place, Open, Duplicate, Delete. */
export function SetsTable({ collectionId }: { collectionId: string }) {
  const sets = useSets(collectionId)
  const { rename, duplicate } = useSetMutations(collectionId)
  const [deleting, setDeleting] = useState<CardSet | null>(null)
  const [now] = useState(() => new Date())

  if (sets.isPending) return <p className={styles.hint}>Loading sets…</p>
  if (sets.isError) {
    return (
      <p role="alert" className={styles.error}>
        Couldn't load the sets.{' '}
        <button type="button" onClick={() => sets.refetch()}>
          Retry
        </button>
      </p>
    )
  }
  if (sets.data.length === 0) return <p className={styles.hint}>No sets yet.</p>

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Set</th>
            <th>Cards</th>
            <th>Last changed</th>
            <th>
              <span className={styles.visuallyHidden}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sets.data.map((set) => (
            <tr key={set.id}>
              <td className={styles.nameCell}>
                <NameInput
                  value={set.name}
                  label={`Name of set ${set.name}`}
                  onCommit={(name) => rename.mutateAsync({ setId: set.id, name })}
                />
              </td>
              <td>{set.cardCount}</td>
              <td>{lastChangedLabel(set.updatedAt, now)}</td>
              <td>
                <div className={styles.actions}>
                  <Link href={paths.set(collectionId, set.id)} aria-label={`Open ${set.name}`}>
                    Open
                  </Link>
                  <button
                    type="button"
                    onClick={() => duplicate.mutate(set.id)}
                    disabled={duplicate.isPending}
                    aria-label={`Duplicate ${set.name}`}
                  >
                    ⧉ Duplicate
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => setDeleting(set)}
                    aria-label={`Delete ${set.name}`}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {duplicate.isError && (
        <p role="alert" className={styles.error}>
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
