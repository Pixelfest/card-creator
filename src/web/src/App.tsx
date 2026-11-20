import { CollectionPage } from './collections/CollectionPage'
import { CreditsPage } from './credits/CreditsPage'
import { HomePage } from './home/HomePage'
import { NotFoundPage } from './NotFoundPage'
import { SetEditorPage } from './sets/SetEditorPage'
import { useRoute } from './router'

export function App() {
  const route = useRoute()
  switch (route.name) {
    case 'home':
      return <HomePage />
    case 'credits':
      return <CreditsPage />
    case 'collection':
      return <CollectionPage key={route.collectionId} collectionId={route.collectionId} />
    case 'set':
      return (
        <SetEditorPage
          key={`${route.collectionId}/${route.setId}`}
          collectionId={route.collectionId}
          setId={route.setId}
        />
      )
    case 'notFound':
      return <NotFoundPage />
  }
}
