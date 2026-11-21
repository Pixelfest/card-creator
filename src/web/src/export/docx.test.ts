import { Packer } from 'docx'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildDocument } from './docx'

// A valid 1×1 PNG; two that differ in one byte of pixel data (and so in their CRC).
const PNG_A = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)
const PNG_B = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

async function unpack(images: Uint8Array[]) {
  const zip = unzipSync(new Uint8Array(await Packer.toArrayBuffer(buildDocument(images))))
  return { xml: strFromU8(zip['word/document.xml']), media: Object.keys(zip).filter((k) => k.startsWith('word/media/')) }
}

const count = (xml: string, pattern: RegExp) => xml.match(pattern)?.length ?? 0

describe('buildDocument', () => {
  it('lays out A4 portrait with one fixed 4 × 3 table per page', async () => {
    const images = [...Array(13).fill(PNG_A), PNG_B]
    const { xml } = await unpack(images)

    expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"')
    expect(xml).toMatch(/<w:pgMar w:top="1841" w:right="338" w:bottom="1841" w:left="338" w:header="0" w:footer="0"/)
    expect(count(xml, /<w:tbl>/g)).toBe(2)
    expect(count(xml, /<w:pageBreakBefore\/>/g)).toBe(1)
    expect(count(xml, /<w:tblLayout w:type="fixed"\/>/g)).toBe(2)
    expect(xml).toContain(
      '<w:tblGrid><w:gridCol w:w="2722"/><w:gridCol w:w="114"/><w:gridCol w:w="2722"/><w:gridCol w:w="114"/><w:gridCol w:w="2722"/><w:gridCol w:w="114"/><w:gridCol w:w="2722"/></w:tblGrid>',
    )
    // Per page: 3 card rows and 2 spacer rows, all exact.
    expect(count(xml, /<w:trHeight w:val="4309" w:hRule="exact"\/>/g)).toBe(6)
    expect(count(xml, /<w:trHeight w:val="114" w:hRule="exact"\/>/g)).toBe(4)
  })

  it('places each image inline at 48 × 76 mm, tight inside ¼ pt cut-line borders', async () => {
    const { xml } = await unpack([PNG_A, PNG_A, PNG_B])

    expect(count(xml, /<wp:inline/g)).toBe(3)
    expect(count(xml, /<wp:anchor/g)).toBe(0)
    expect(count(xml, /<wp:extent cx="1728000" cy="2736000"\/>/g)).toBe(3)
    // The white cut border is in the PNG, so cells have no margins of their own.
    expect(count(xml, /<w:tcMar>/g)).toBe(0)
    // Three card cells with four borders each; empty cells and spacers have none.
    expect(count(xml, /<w:(top|bottom|left|right) w:val="single" w:color="000000" w:sz="2"\/>/g)).toBe(12)
    expect(xml).toMatch(/<w:tblCellMar><w:top w:type="dxa" w:w="0"\/><w:left w:type="dxa" w:w="0"\/><w:bottom w:type="dxa" w:w="0"\/><w:right w:type="dxa" w:w="0"\/><\/w:tblCellMar>/)
  })

  it('stores an image used for several Copies once', async () => {
    const { xml, media } = await unpack([PNG_A, PNG_A, PNG_A, PNG_B, PNG_B])
    expect(media).toHaveLength(2)
    expect(new Set(xml.match(/r:embed="[^"]+"/g)).size).toBe(2)
  })
})
