import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { isNotFound } from '../api/http'
import { copyText } from '../clipboard'
import { NotFoundPage } from '../NotFoundPage'
import { Link } from '../Link'
import { paths } from '../router'
import { useCollection, useRenameCollection, type Collection } from './api'
import styles from './CollectionPage.module.css'
import { forget, recordVisit } from './recentCollections'

export function CollectionPage({ collectionId }: { collectionId: string }) {
  const query = useCollection(collectionId)
  const collection = query.data

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
          <CollectionName key={collection.name} collection={collection} />
          <div className={styles.actions}>
            <CopyLinkButton collectionId={collection.id} />
          </div>
        </>
      )}
    </main>
  )
}

/** The name, edited in place: saved on Enter or leaving the field, Escape cancels. */
function CollectionName({ collection }: { collection: Collection }) {
  const rename = useRenameCollection(collection.id)
  const [draft, setDraft] = useState(collection.name)
  const cancelled = useRef(false)

  function commit() {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(collection.name)
      return
    }
    const name = draft.trim()
    if (!name || name === collection.name) {
      setDraft(collection.name)
      return
    }
    rename.mutate(name, { onError: () => setDraft(collection.name) })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      cancelled.current = true
      event.currentTarget.blur()
    }
  }

  return (
    <div>
      <input
        className={styles.name}
        aria-label="Collection name"
        value={draft}
        maxLength={200}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {rename.isError && (
        <p role="alert" className={styles.error}>
          Couldn't save the name. Try again.
        </p>
      )}
    </div>
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
