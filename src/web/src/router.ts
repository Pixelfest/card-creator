import { useSyncExternalStore } from 'react'

// A deliberately tiny router: the app has a handful of fixed URLs (docs/spec.md, section 3).

export type Route =
  | { name: 'home' }
  | { name: 'credits' }
  | { name: 'collection'; collectionId: string }
  | { name: 'set'; collectionId: string; setId: string }
  | { name: 'notFound' }

const collectionPath = /^\/c\/([0-9A-Za-z]{22})\/?$/
const setPath = /^\/c\/([0-9A-Za-z]{22})\/s\/([0-9A-Za-z]{22})\/?$/

export function matchRoute(pathname: string): Route {
  if (pathname === '/') return { name: 'home' }
  if (pathname === '/credits') return { name: 'credits' }
  const collection = collectionPath.exec(pathname)
  if (collection) return { name: 'collection', collectionId: collection[1] }
  const set = setPath.exec(pathname)
  if (set) return { name: 'set', collectionId: set[1], setId: set[2] }
  return { name: 'notFound' }
}

export const paths = {
  home: () => '/',
  credits: () => '/credits',
  collection: (collectionId: string) => `/c/${collectionId}`,
  set: (collectionId: string, setId: string) => `/c/${collectionId}/s/${setId}`,
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
