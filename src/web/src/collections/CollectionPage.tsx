import { Footer } from '../components/Footer'
import { useEffect, useState } from 'react'
import { isNotFound } from '../api/http'
import { copyText } from '../clipboard'
import { NameInput } from '../components/NameInput'
import { NotFoundPage } from '../NotFoundPage'
import { Link } from '../Link'
import { paths } from '../router'
import { useSetMutations } from '../sets/api'
import { SetsTable } from '../sets/SetsTable'
import { useCollection, useRenameCollection } from './api'
import styles from './CollectionPage.module.css'
import { forget, recordVisit } from './recentCollections'

export function CollectionPage({ collectionId }: { collectionId: string }) {
  const query = useCollection(collectionId)
  const collection = query.data
  const rename = useRenameCollection(collectionId)

  useEffect(() => {
    if (collection) {
      recordVisit({ id: collection.id, name: collection.name })
      document.title = `${collection.name} · Card Creator`
    }
  }, [collection])

  const notFound = isNotFound(query.error)
  useEffect(() => {
    if (notFound) forget(collectionId)
  }, [notFound, collectionId])

  if (notFound) {
    return <NotFoundPage message="There is no collection at this link. Check that you copied all of it." />
  }

  return (
    <>
    <main className={styles.page}>
      <Link href={paths.home()}>← Home</Link>
      {query.isPending && <p className={styles.hint}>Loading…</p>}
      {query.isError && (
        <p role="alert" className={styles.error}>
          Couldn't load the collection.{' '}
          <button type="button" onClick={() => query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {collection && (
        <>
          <NameInput
            value={collection.name}
            label="Collection name"
            className={styles.name}
            onCommit={(name) => rename.mutateAsync(name)}
          />
          <div className={styles.actions}>
            <NewSetButton collectionId={collection.id} />
            <CopyLinkButton collectionId={collection.id} />
          </div>
          <SetsTable collectionId={collection.id} />
        </>
      )}
    </main>
      <Footer />
    </>
  )
}

function NewSetButton({ collectionId }: { collectionId: string }) {
  const { create } = useSetMutations(collectionId)
  return (
    <>
      <button
        type="button"
        className={styles.primary}
        onClick={() => create.mutate()}
        disabled={create.isPending}
      >
        + New set
      </button>
      {create.isError && (
        <span role="alert" className={styles.error}>
          Couldn't create the set. Try again.
        </span>
      )}
    </>
  )
}

function CopyLinkButton({ collectionId }: { collectionId: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [state])

  async function copy() {
    const copied = await copyText(window.location.origin + paths.collection(collectionId))
    setState(copied ? 'copied' : 'failed')
  }

  return (
    <>
      <button type="button" onClick={copy}>
        🔗 Copy collection link
      </button>
      <span className={styles.hint} aria-live="polite">
        {state === 'copied' && 'Copied'}
        {state === 'failed' && "Couldn't copy. Copy the address bar instead."}
      </span>
    </>
  )
}
