import { fetchJson } from '../api/http'

export type UploadedArtwork = { id: string; url: string; width: number; height: number; contentType: string }

export const MAX_ARTWORK_BYTES = 10 * 1024 * 1024
export const ACCEPTED_ARTWORK = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

export function artworkUrl(collectionId: string, artworkId: string): string {
  return `/api/collections/${collectionId}/artwork/${artworkId}`
}

/** The format from a file's first bytes, like the server checks it: JPG, PNG or WebP. */
export function sniffArtwork(header: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  const starts = (bytes: number[], offset = 0) => bytes.every((b, i) => header[offset + i] === b)
  if (starts([0xff, 0xd8, 0xff])) return 'jpeg'
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  return null
}

/** Refuses a file before uploading it (the server checks again). Null means it is fine. */
export async function checkArtworkFile(file: Blob): Promise<string | null> {
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_ARTWORK_BYTES) return 'That image is larger than 10 MB.'
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!sniffArtwork(header)) return 'Only JPG, PNG and WebP images can be used.'
  return null
}

/** The first image on the clipboard, or null when it holds none (say, only text). */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  for (const item of Array.from(data?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

/**
 * Makes a pasted image uploadable. JPG, PNG and WebP pass through; anything else the browser
 * can decode (BMP from a Windows copy, GIF, ...) is redrawn as a PNG at its full size. Null
 * means the browser can't read it.
 */
export async function toArtworkBlob(image: Blob): Promise<Blob | null> {
  const header = new Uint8Array(await image.slice(0, 12).arrayBuffer())
  if (sniffArtwork(header)) return image
  try {
    const bitmap = await createImageBitmap(image)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    bitmap.close()
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  } catch {
    return null
  }
}

const extensions = { jpeg: 'jpg', png: 'png', webp: 'webp' }

/** `pasted-image.png`, with the extension from the file's real format. */
export async function pastedName(image: Blob): Promise<string> {
  const kind = sniffArtwork(new Uint8Array(await image.slice(0, 12).arrayBuffer()))
  return `pasted-image.${kind ? extensions[kind] : 'png'}`
}

export function uploadArtwork(collectionId: string, file: Blob, name = 'artwork'): Promise<UploadedArtwork> {
  const form = new FormData()
  form.append('file', file, name)
  return fetchJson<UploadedArtwork>(`/api/collections/${collectionId}/artwork`, { method: 'POST', body: form })
}
