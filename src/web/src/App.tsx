import { CollectionPage } from './collections/CollectionPage'
import { HomePage } from './home/HomePage'
import { NotFoundPage } from './NotFoundPage'
import { useRoute } from './router'

export function App() {
  const route = useRoute()
  switch (route.name) {
    case 'home':
      return <HomePage />
    case 'collection':
      return <CollectionPage key={route.collectionId} collectionId={route.collectionId} />
    case 'notFound':
      return <NotFoundPage />
  }
}
