import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../api/http'

/** One repository-supplied asset. Cards store `path`; `url` is content-hashed. */
export type Asset = {
  path: string
  displayName: string
  url: string
  /** Width / height, for images only. */
  aspectRatio: number | null
}

export type AssetManifest = {
  frames: Asset[]
  fonts: Asset[]
  snippetBackgrounds: Asset[]
  /** Twemoji SVGs live at `${baseUrl}${codepoints}.svg`; null when there are none. */
  emoji: { baseUrl: string } | null
}

/** The asset library only changes when the server is redeployed. */
export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: () => fetchJson<AssetManifest>('/api/assets'),
    staleTime: Infinity,
  })
}

export function useCredits() {
  return useQuery({
    queryKey: ['credits'],
    queryFn: () => fetchJson<{ markdown: string }>('/api/credits'),
    staleTime: Infinity,
  })
}
