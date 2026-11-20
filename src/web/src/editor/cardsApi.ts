import { ApiError, fetchJson } from '../api/http'
import type { Card, CardContent, ServerCard } from './model'

export type SaveResult =
  | { kind: 'saved'; card: ServerCard }
  | { kind: 'conflict'; card: ServerCard }
  | { kind: 'notFound' }

/** What the save queue needs from the server; tests swap in a fake. */
export type CardsApi = {
  list(): Promise<ServerCard[]>
  create(card: Card, position: number, keepalive?: boolean): Promise<'created' | 'exists'>
  save(id: string, content: CardContent, version: number, keepalive?: boolean): Promise<SaveResult>
  remove(id: string, keepalive?: boolean): Promise<void>
  reorder(ids: string[], keepalive?: boolean): Promise<void>
}

export function httpCardsApi(collectionId: string, setId: string): CardsApi {
  const base = `/api/collections/${collectionId}/sets/${setId}/cards`
  const send = (method: string, url: string, body: unknown, keepalive = false) =>
    fetchJson<unknown>(url, { method, body: JSON.stringify(body), keepalive })

  return {
    list: () => fetchJson<ServerCard[]>(base),

    async create(card, position, keepalive) {
      try {
        await send('POST', base, { ...card, position }, keepalive)
        return 'created'
      } catch (error) {
        // An earlier attempt reached the server even though its response was lost.
        if (error instanceof ApiError && error.status === 409) return 'exists'
        throw error
      }
    },

    async save(id, content, version, keepalive) {
      try {
        const card = (await send('PUT', `${base}/${id}`, { ...content, version }, keepalive)) as ServerCard
        return { kind: 'saved', card }
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          return { kind: 'conflict', card: error.problem as unknown as ServerCard }
        }
        if (error instanceof ApiError && error.status === 404) return { kind: 'notFound' }
        throw error
      }
    },

    async remove(id, keepalive) {
      try {
        await fetchJson<void>(`${base}/${id}`, { method: 'DELETE', keepalive })
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return // already gone
        throw error
      }
    },

    async reorder(ids, keepalive) {
      await send('PUT', `${base}/order`, { cardIds: ids }, keepalive)
    },
  }
}
