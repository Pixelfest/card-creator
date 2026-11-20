import { describe, expect, it } from 'vitest'
import { checkArtworkFile, MAX_ARTWORK_BYTES, sniffArtwork } from './api'

const bytes = (...values: number[]) => new Uint8Array(values)
const jpegHeader = [0xff, 0xd8, 0xff, 0xe0]
const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const webpHeader = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]

describe('sniffArtwork', () => {
  it('recognises JPG, PNG and WebP by their first bytes', () => {
    expect(sniffArtwork(bytes(...jpegHeader))).toBe('jpeg')
    expect(sniffArtwork(bytes(...pngHeader))).toBe('png')
    expect(sniffArtwork(bytes(...webpHeader))).toBe('webp')
  })

  it('refuses everything else, including other RIFF files and GIFs', () => {
    expect(sniffArtwork(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBeNull()
    expect(sniffArtwork(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull()
    expect(sniffArtwork(bytes())).toBeNull()
  })
})

describe('checkArtworkFile', () => {
  it('accepts an image within 10 MB', async () => {
    expect(await checkArtworkFile(new Blob([bytes(...pngHeader, 0, 0)]))).toBeNull()
  })

  it('refuses empty, oversized and wrong-type files before uploading', async () => {
    expect(await checkArtworkFile(new Blob([]))).toBe('That file is empty.')
    const big = new Uint8Array(MAX_ARTWORK_BYTES + 1)
    big.set(jpegHeader)
    expect(await checkArtworkFile(new Blob([big]))).toBe('That image is larger than 10 MB.')
    expect(await checkArtworkFile(new Blob(['just text']))).toBe('Only JPG, PNG and WebP images can be used.')
  })
})
