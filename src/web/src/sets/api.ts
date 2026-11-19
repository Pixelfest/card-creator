import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJson, isNotFound } from '../api/http'

/** A Set ("CardSet" only to stay clear of JavaScript's built-in Set). */
export type CardSet = {
  id: string
  collectionId: string
  name: string
  cardFormat: string
  cardCount: number
  createdAt: string
  updatedAt: string
}

const setsKey = (collectionId: string) => ['collection', collectionId, 'sets'] as const
const setKey = (collectionId: string, setId: string) => [...setsKey(collectionId), setId] as const
const setsUrl = (collectionId: string) => `/api/collections/${collectionId}/sets`
const setUrl = (collectionId: string, setId: string) => `${setsUrl(collectionId)}/${setId}`

export function useSets(collectionId: string) {
  return useQuery({
    queryKey: setsKey(collectionId),
    queryFn: () => fetchJson<CardSet[]>(setsUrl(collectionId)),
  })
}

export function useSet(collectionId: string, setId: string) {
  return useQuery({
    queryKey: setKey(collectionId, setId),
    queryFn: () => fetchJson<CardSet>(setUrl(collectionId, setId)),
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
  })
}

/** Mutations on one Collection's Sets; each refreshes the Sets table afterwards. */
export function useSetMutations(collectionId: string) {
  const queryClient = useQueryClient()
  const refreshList = () => queryClient.invalidateQueries({ queryKey: setsKey(collectionId), exact: true })
  const remember = (set: CardSet) => queryClient.setQueryData(setKey(collectionId, set.id), set)

  const create = useMutation({
    mutationFn: () => fetchJson<CardSet>(setsUrl(collectionId), { method: 'POST' }),
    onSuccess: (set) => {
      remember(set)
      return refreshList()
    },
  })

  const rename = useMutation({
    mutationFn: ({ setId, name }: { setId: string; name: string }) =>
      fetchJson<CardSet>(setUrl(collectionId, setId), {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (set) => {
      remember(set)
      return refreshList()
    },
  })

  const duplicate = useMutation({
    mutationFn: (setId: string) =>
      fetchJson<CardSet>(`${setUrl(collectionId, setId)}/duplicate`, { method: 'POST' }),
    onSuccess: (set) => {
      remember(set)
      return refreshList()
    },
  })

  const remove = useMutation({
    mutationFn: (setId: string) => fetchJson<void>(setUrl(collectionId, setId), { method: 'DELETE' }),
    onSuccess: (_, setId) => {
      queryClient.removeQueries({ queryKey: setKey(collectionId, setId) })
      return refreshList()
    },
  })

  return { create, rename, duplicate, remove }
}
