import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJson, isNotFound } from '../api/http'

export type Collection = { id: string; name: string; createdAt: string }

const collectionKey = (collectionId: string) => ['collection', collectionId] as const

/** Whether this client's IP may create a Collection; the server enforces it too. */
export function useCollectionCreation() {
  return useQuery({
    queryKey: ['collection-creation'],
    queryFn: () => fetchJson<{ allowed: boolean; clientIp: string | null }>('/api/collection-creation'),
  })
}

export function useCollection(collectionId: string) {
  return useQuery({
    queryKey: collectionKey(collectionId),
    queryFn: () => fetchJson<Collection>(`/api/collections/${collectionId}`),
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
  })
}

export function useCreateCollection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson<Collection>('/api/collections', { method: 'POST' }),
    onSuccess: (collection) => queryClient.setQueryData(collectionKey(collection.id), collection),
  })
}

export function useRenameCollection(collectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      fetchJson<Collection>(`/api/collections/${collectionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (collection) => queryClient.setQueryData(collectionKey(collectionId), collection),
  })
}
