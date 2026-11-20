import { useQuery } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { fetchJson, isNotFound } from '../api/http'
import { useCollection } from '../collections/api'
import { NameInput } from '../components/NameInput'
import { CardList } from '../editor/CardList'
import { CardStage } from '../editor/CardStage'
import { EditorProvider } from '../editor/EditorProvider'
import type { ServerCard } from '../editor/model'
import { PartsPanel } from '../editor/PartsPanel'
import { ConflictDialog, SaveStatus } from '../editor/SaveStatus'
import { UndoRedo } from '../editor/UndoRedo'
import { ExportButton } from '../export/ExportDialog'
import { Link } from '../Link'
import { NotFoundPage } from '../NotFoundPage'
import { paths } from '../router'
import { useSet, useSetMutations } from './api'
import styles from './SetEditorPage.module.css'

/** The Set's Cards, fetched fresh each time the editor opens; the editor owns them after. */
function useInitialCards(collectionId: string, setId: string) {
  return useQuery({
    queryKey: ['collection', collectionId, 'sets', setId, 'cards'],
    queryFn: () => fetchJson<ServerCard[]>(`/api/collections/${collectionId}/sets/${setId}/cards`),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
  })
}

/** The Set editor (docs/spec.md, section 7): card list, the card, and its properties. */
export function SetEditorPage({ collectionId, setId }: { collectionId: string; setId: string }) {
  const set = useSet(collectionId, setId)
  const cards = useInitialCards(collectionId, setId)

  useEffect(() => {
    if (set.data) document.title = set.data.name
  }, [set.data])

  if (isNotFound(set.error) || isNotFound(cards.error)) {
    return <NotFoundPage message="There is no set at this link. Check that you copied all of it." />
  }

  if (!cards.data) {
    return (
      <Layout collectionId={collectionId} setId={setId}>
        {cards.isError ? (
          <p role="alert" className={styles.error}>
            Couldn't load the cards.{' '}
            <button type="button" onClick={() => cards.refetch()}>
              Retry
            </button>
          </p>
        ) : (
          <p className={styles.hint}>Loading…</p>
        )}
      </Layout>
    )
  }

  return (
    <EditorProvider collectionId={collectionId} setId={setId} initial={cards.data}>
      <Layout
        collectionId={collectionId}
        setId={setId}
        status={
          <>
            <UndoRedo />
            <SaveStatus />
            <ExportButton setName={set.data?.name ?? ''} />
          </>
        }
      >
        <CardList />
      </Layout>
      <ConflictDialog />
    </EditorProvider>
  )
}

function Layout({
  collectionId,
  setId,
  status,
  children,
}: {
  collectionId: string
  setId: string
  status?: ReactNode
  children: ReactNode
}) {
  const collection = useCollection(collectionId)
  const set = useSet(collectionId, setId)
  const { rename } = useSetMutations(collectionId)

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
        {set.isError && !isNotFound(set.error) && (
          <span role="alert" className={styles.error}>
            Couldn't load the set.{' '}
            <button type="button" onClick={() => set.refetch()}>
              Retry
            </button>
          </span>
        )}
        <div className={styles.headerEnd}>{status}</div>
      </header>

      <aside className={styles.cardList} aria-label="Card list">
        {children}
      </aside>
      <main className={styles.stage} aria-label="Card">
        {status ? <CardStage /> : null}
      </main>
      <aside className={styles.properties} aria-label="Properties">
        {status ? <PartsPanel /> : null}
      </aside>
    </div>
  )
}
