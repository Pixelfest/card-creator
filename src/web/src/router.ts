import { useSyncExternalStore } from 'react'

// A deliberately tiny router: the app has a handful of fixed URLs (docs/spec.md, section 3).

export type Route =
  | { name: 'home' }
  | { name: 'collection'; collectionId: string }
  | { name: 'notFound' }

const collectionPath = /^\/c\/([0-9A-Za-z]{22})\/?$/

export function matchRoute(pathname: string): Route {
  if (pathname === '/') return { name: 'home' }
  const collection = collectionPath.exec(pathname)
  if (collection) return { name: 'collection', collectionId: collection[1] }
  return { name: 'notFound' }
}

export const paths = {
  home: () => '/',
  collection: (collectionId: string) => `/c/${collectionId}`,
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname)
  return matchRoute(pathname)
}

export function navigate(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
