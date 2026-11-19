# Research: generating an A4 .docx with exact-size card images in the browser

Issue: #3. Researched 2026-11-19, against `docx` 9.16.0 (latest on npm at the time).

## TL;DR / recommendation

- **Library:** use [`docx`](https://www.npmjs.com/package/docx) (dolanmiu/docx, MIT). It runs fully client-side. `Packer.toBlob(doc)` gives a Blob you can download. The same code runs in Node (`Packer.toBuffer`), so moving it to a server later is easy.
- **Layout:** one fixed-layout **table per page**: 4 card columns with 4 mm spacer columns between them, and 3 card rows with 4 mm spacer rows. Card rows are `hRule="exact"` and 72 mm tall, card columns 44 mm wide. All cell margins are 0. Each card cell holds one **inline** `ImageRun` sized 44 × 72 mm. Avoid floating/anchored images.
- **Cut lines:** use **table-cell borders** on the card cells: single, `sz=2` (1/4 pt ≈ 0.09 mm), black. The other options are baking the line into the PNG (the safest fallback) or using the image `outline`.
- **Per page:** **12 cards** (4 × 3) with 10 mm margins and 4 mm gaps. That is the maximum for a regular grid on A4.
- **Duplicates:** `docx` already stores each identical image once. It keys media by the SHA-1 of the image bytes. Pass the *same* `Uint8Array` (or identical bytes) for every copy of a card. File size then scales with the number of **unique** cards, not total copies.
- **Exact print size:** Word lays images out at the size in `wp:extent` (EMU). Pixel count doesn't matter. This was checked in Word: images measured 43.99 × 71.98 mm, which is rounding to Word's 1-twip grid. Tell users to print at 100 % / "Actual size". Word's *Scale content for A4 or 8.5 × 11" paper sizes* option and printer "fit to page" settings can shrink output.

## 1. Library options

| Option | Where it runs | Notes |
|---|---|---|
| **`docx` (npm, dolanmiu/docx)** | Browser + Node | Declarative API covering tables, images, borders and section page setup. Its `package.json` says it "Works for Node and on the Browser". Its dependencies are `fflate` (zip) and `nanoid`. `Packer` exports `toBlob`, `toArrayBuffer`, `toBuffer`, `toBase64String` and `toStream`. *Source: `docx@9.16.0` package (`package.json`, `dist/index.mjs`, class `Packer`).* |
| python-docx | Server (Python) | Mature. `add_picture(..., width=Mm(44))`. It also dedupes images by SHA-1: `ImageParts.get_or_add_image_part` calls `_get_by_sha1` and returns an existing part on a match. *Source: [python-docx `src/docx/package.py`](https://github.com/python-openxml/python-docx/blob/master/src/docx/package.py), [`parts/image.py`](https://github.com/python-openxml/python-docx/blob/master/src/docx/parts/image.py).* |
| Open XML SDK (`DocumentFormat.OpenXml`, .NET) | Server (.NET) | Microsoft's own low-level SDK. You write the same XML elements yourself (`wp:extent`, `w:trHeight`, `w:tcBorders`). More code. Only worth it if the backend is .NET. |
| Hand-rolled (fflate/JSZip + XML templates) | Browser | Feasible, since the document is only a few XML parts plus media. But `docx` already handles content types, relationships and media naming correctly (see the comment in `Media` about Word for the web needing `image1.png`-style names). |

There's no need for a server. The heavy part is the PNG bytes the app already has, and `docx` only zips them.

## 2. Units: EMU, twips, eighth-points

| Quantity | OOXML unit | Value for this project | Source |
|---|---|---|---|
| Image size (`wp:extent cx/cy`) | EMU: 914 400 per inch, so **36 000 per mm** | 44 mm = **1 584 000**, 72 mm = **2 592 000** | ISO/IEC 29500 §20.4.2.7, as quoted on [MS Learn `Extent`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.wordprocessing.extent): "the extents of the parent DrawingML object … its final height and width", in EMUs |
| Page size (`w:pgSz w:w/w:h`) | twips (1/20 pt; 1440 per inch, about 56.69 per mm) | A4 = **11906 × 16838** (`docx` default) | §17.6.13, [MS Learn `PageSize`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.pagesize) (example uses 11907 × 16839 for A4); `docx` `sectionPageSizeDefaults` |
| Margins, column widths, row heights | twips | 10 mm = 566; 44 mm = 2494; 72 mm = 4082 (ceil); 4 mm = 226 | §17.4.80 `trHeight` ([MS Learn](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.tablerowheight)): `hRule="exact"` gives "exactly N twentieths of a point" |
| Border width (`w:sz`) | eighths of a point | `2` = 1/4 pt, the thinnest single line | §17.3.4; `docx` `eighthPointMeasureValue` |
| Image outline (`a:ln w`) | EMU (12700 per pt) | 3175 = 1/4 pt | `docx` images docs |

**How `docx` sizes images:** `ImageRun.transformation.width/height` are **pixels at 96 per inch**, not EMUs. The library computes `emus = Math.round(px * 9525)` (`dist/index.mjs`, `createImageData`). Because 9525 × 96 = 914 400 exactly, pass `mm / 25.4 * 96` as a float. Don't round it yourself. 44 mm then becomes exactly `cx="1584000"` (confirmed in generated `document.xml`). The PNG's own pixel dimensions and DPI metadata don't matter for layout. Word reported the inline shape at `ScaleWidth=32` %, meaning it stretches the 520 px bitmap to the extent.

`convertMillimetersToTwip` in `docx` **floors** (72 mm becomes 4081 twips, which is 71.98 mm). For the exact-height card row, use `Math.ceil(mm / 25.4 * 1440)` so the 72 mm image is never clipped by 1 twip.

## 3. Does Word print at exact physical size?

Yes, provided nothing scales the print job:

- The layout size is the `wp:extent`. A Word COM measurement of a generated file, with 10 mm margins, gave image 1 at x = 9.93 mm, y = 9.93 mm, size 43.99 × 71.98 mm. The column pitch was ≈ 47.9–48.1 mm, against 48 expected. The row pitch was 75.99 mm, against 76 expected. Thirty cards produced exactly 3 pages. The tiny differences come from Word's twip/point rounding.
- Word has an option, **File › Options › Advanced › Print › "Scale content for A4 or 8.5 × 11" paper sizes"**, that rescales A4 documents to Letter paper (and vice versa). Users printing on A4 aren't affected. Users with a Letter default printer are. *Source: [Microsoft Support, "Turn off automatic paper scaling"](https://support.microsoft.com/en-au/office/turn-off-automatic-paper-scaling-7b8af1e8-7b6d-4d6f-9611-0170b53c64c6).*
- Printer-driver "Fit to page" or "Shrink oversized pages" settings can also scale. Put a one-line hint in the UI: print at 100 % / Actual size on A4. Optionally add a 50 mm calibration line in the header (out of scope here).
- Margins: most office printers can't print the outer ~3–5 mm. With 10 mm margins the 4 × 3 grid is comfortably inside the printable area.

## 4. Layout options and reliability

| Approach | How | Word | LibreOffice | Google Docs | Verdict |
|---|---|---|---|---|---|
| **Table grid + inline images** | Fixed-layout table (`w:tblLayout fixed`), explicit `columnWidths`, exact row heights, zero cell margins, one inline image per cell | Verified (measurements above) | Supports fixed table widths and exact row heights (not tested here) | Imports tables with inline images. Google Docs has only *minimum* row height, so gaps can grow slightly (not tested here) | **Recommended.** The grid holds geometry, and cell borders give cut lines. Pagination is predictable: one table per page. |
| Inline images in paragraphs (no table) | Images in a line, spacing via spaces or indents | Works, but gaps depend on font metrics and line spacing | Same | Same | Not recommended. Gaps aren't exact. |
| Floating/anchored images (`wp:anchor`) | Each image positioned with absolute EMU offsets relative to the page | Exact | Generally imported, but wrap and anchor differences are common | Floating-image support is partial. Positions are often lost | Avoid. It's the most fragile across apps, and 12 anchors per page all hang off paragraphs that can move between pages. |

Notes for the table approach (all verified in Word):

- Set table borders to `TableBorders.NONE` and give **only the card cells** their four borders. Spacer cells then show nothing. Shared edges show the card's line, as conflict resolution keeps the visible border (§17.4.66 `tcBorders`).
- Set table-level cell margins to **0**. Otherwise Word's default 0.19 cm left/right cell padding widens the 4 mm spacer columns. Measured: 4.16 mm with default padding, 3.99 mm with zero padding.
- Card paragraphs need `spacing before/after = 0` so the inline image sits flush in the cell.
- Put a `pageBreakBefore` paragraph between page tables. A 4 × 3 table is 224 mm tall, well under the 277 mm body height, so Word's mandatory trailing paragraph after a table doesn't spill onto an extra blank page.
- Cell borders are drawn on the cell edge, half inside and half outside. At 1/4 pt (0.088 mm) this doesn't matter for cutting.

## 5. Cut lines

| Method | Pros | Cons |
|---|---|---|
| **Table-cell borders** (`w:tcBorders`, single, `sz=2`, black) | Native and crisp (vector). Exactly on the card edge. Rendered by every editor that renders tables. No change to card PNGs. | Tied to the table approach (fine). |
| Image outline (`ImageRun.outline`, DrawingML `a:ln` on `pic:spPr`) | Works for any layout, and `docx` supports it. | Line is centred on the image edge. Support in Google Docs and LibreOffice is less certain than for table borders. `docx` also adds an `effectExtent`. |
| Baked into the PNG (draw a 1–2 px black stroke on the canvas edge) | Survives any app, including image-only conversions. At 300 DPI, 1 px ≈ 0.085 mm. | The line becomes part of the artwork. Antialiasing at the edge, and the line is inside the 44 × 72 mm. Changing it means re-rendering. |

Recommendation: table-cell borders. Keep baking the line into the PNG as a fallback if a target app drops borders.

## 6. Duplicates: one media part per unique image

- `docx` 9.16 names each image by `hashedId(options.data)`, which is the SHA-1 of the bytes plus the extension. `Media.addImage(key, …)` returns early if the key already exists. The source comment reads "an image used twice is stored once" (`dist/index.mjs`, `Media` class and `createRegularImageData`).
- Verified: 150 cards built from 10 unique PNGs produced **10** files in `word/media/` and 10 distinct `r:embed` ids in `document.xml`.
- OPC allows any number of `a:blip r:embed` references to one relationship/part, so this is spec-valid and is what Word itself does.
- To benefit, encode each card's PNG **once** (e.g. `canvas.toBlob` → `arrayBuffer`) and reuse that buffer for all its Copies. Re-encoding the same canvas usually gives identical bytes, but caching avoids the cost anyway.

## 7. File size and memory (100–200 cards at 300 DPI)

- A 44 × 72 mm card at 300 DPI is **520 × 850 px**. Decoded RGBA is about 1.77 MB per canvas.
- PNG is already deflated, so zipping it into the .docx saves almost nothing. **The .docx size ≈ sum of unique PNG sizes + about 20 KB of XML.**
- Measured with `docx` 9.16 in Node 24, using synthetic 520 × 850 RGB PNGs (real card art will differ; flat-colour cards compress far better):

| Unique / total cards | PNG each | .docx | Build time |
|---|---|---|---|
| 1 / 1 | 573 KB | 579 KB | 0.16 s |
| 10 / 150 | 573 KB | 5.7 MB | 0.8 s |
| 10 / 150 (noisy image) | 1.2 MB | 12 MB | 1.2 s |
| 150 / 150 (noisy, worst case) | 1.2 MB | 183 MB | 15 s |

- Typical board-game cards with flat backgrounds and text are usually 100–400 KB as PNG at this size. A 50-unique-card deck should then come out at a few MB to about 20 MB.
- **Browser memory:** peak is about 2–3 × the unique-PNG total: the PNG buffers, plus the zip output, plus the final Blob. For 50 unique cards at ~300 KB that is ~50 MB, which is fine. Keep encoded PNG `Uint8Array`s, not canvases or ImageBitmaps, for every card. Render one card at a time to an offscreen canvas, encode it, and drop the canvas. Only the worst case (hundreds of unique, photo-noisy cards) gets into the hundreds of MB.
- If size becomes a problem, JPEG at quality 90 cuts photo-like art by about 3–5×. `docx` accepts `type: "jpg"`, but text edges suffer. Keep PNG as the default.

## 8. How many 44 × 72 mm cards fit on A4 (210 × 297 mm)?

With 10 mm margins the body is 190 × 277 mm.

| Arrangement | Width used | Height used | Cards |
|---|---|---|---|
| **Portrait, cards upright, 4 cols × 3 rows, 4 mm gaps** | 4·44 + 3·4 = **188** ≤ 190 | 3·72 + 2·4 = **224** ≤ 277 | **12** |
| Portrait, 4 rows | — | 4·72 = 288 > 277 (even 0 mm margins: 288 + gaps > 297) | not possible |
| Portrait, cards rotated (72 × 44), 2 × 6 | 2·72 + 4 = 148 | 6·44 + 5·2 = 274 (gaps ≤ 2.6 mm) | 12 |
| Landscape, upright, 6 × 2 | 6·44 + 5·2 = 274 ≤ 277 (gaps ≤ 2.6 mm) | 2·72 + 4 = 148 | 12 |

So **12 per page** is the practical maximum. Use the portrait 4 × 3 layout: it allows comfortable 4 mm gaps and leaves about 53 mm free at the bottom, enough for a header or footer line. To centre the grid, use 11 mm left/right margins (188 mm grid in 210 mm).

## 9. Minimal sketch (verified shape)

```ts
import { Document, Packer, Paragraph, ImageRun, Table, TableRow, TableCell, TableBorders,
         TableLayoutType, WidthType, HeightRule, BorderStyle } from "docx";

const twip = (mm: number) => Math.round(mm / 25.4 * 1440);
const px96 = (mm: number) => mm / 25.4 * 96;          // docx converts px → EMU (×9525)
const CUT = { style: BorderStyle.SINGLE, size: 2, color: "000000" }; // 1/4 pt
const COLS = 4, ROWS = 3, GAP = 4;

function cardCell(png?: Uint8Array) {
  return new TableCell({
    width: { size: twip(44), type: WidthType.DXA },
    borders: png ? { top: CUT, bottom: CUT, left: CUT, right: CUT } : undefined,
    children: [new Paragraph({ spacing: { before: 0, after: 0 },
      children: png ? [new ImageRun({ type: "png", data: png,
        transformation: { width: px96(44), height: px96(72) } })] : [] })],
  });
}
const gapCell = () => new TableCell({ width: { size: twip(GAP), type: WidthType.DXA },
  children: [new Paragraph({ spacing: { before: 0, after: 0 } })] });

function pageTable(cards: (Uint8Array | undefined)[]) {
  const rows: TableRow[] = [];
  for (let r = 0; r < ROWS; r++) {
    const cells = [];
    for (let c = 0; c < COLS; c++) { if (c) cells.push(gapCell()); cells.push(cardCell(cards[r * COLS + c])); }
    rows.push(new TableRow({ height: { value: Math.ceil(72 / 25.4 * 1440), rule: HeightRule.EXACT },
                             cantSplit: true, children: cells }));
    if (r < ROWS - 1) rows.push(new TableRow({ height: { value: twip(GAP), rule: HeightRule.EXACT },
                             children: Array.from({ length: COLS * 2 - 1 }, gapCell) }));
  }
  return new Table({ layout: TableLayoutType.FIXED, borders: TableBorders.NONE,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    columnWidths: Array.from({ length: COLS * 2 - 1 }, (_, i) => twip(i % 2 ? GAP : 44)), rows });
}
// cards: one entry per Copy, reusing the same Uint8Array per unique card → stored once.
// children = pageTable(slice) per 12 cards, separated by new Paragraph({ pageBreakBefore: true }).
// new Document({ sections: [{ properties: { page: { size: { width: 11906, height: 16838 },
//   margin: { top: twip(10), bottom: twip(10), left: twip(11), right: twip(11), header: 0, footer: 0 } } }, children }] })
// const blob = await Packer.toBlob(doc);
```

## 10. Open points and not verified

- LibreOffice Writer and Google Docs rendering of the table layout was **not** tested (neither was available). Before release, open a generated file in both and check the grid, the borders and 12 cards per page. Google Docs is expected to be the weakest, because it has only minimum row heights.
- Real card PNG sizes depend on the art. Re-measure with actual exported cards.
- Older `docx` versions (< 9) used different media naming. Pin `docx@^9.16`.

## Sources

- `docx` 9.16.0 npm package source (`dist/index.mjs`: `createImageData`, `createRegularImageData`, `hashedId`, `Media.addImage`, `Packer`, `TableBorders`, `convertMillimetersToTwip`, `sectionPageSizeDefaults`). Repo: https://github.com/dolanmiu/docx
- `docx` image docs: https://github.com/dolanmiu/docx/blob/master/docs/usage/images.md
- ISO/IEC 29500-1 (ECMA-376) element docs via Microsoft Learn (Open XML SDK reference):
  - `wp:extent`: https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.wordprocessing.extent
  - `w:pgSz`: https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.pagesize
  - `w:trHeight`: https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.tablerowheight
  - `w:top` (table cell border, `tcBorders` conflict rules): https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.topborder
- Microsoft Support, Turn off automatic paper scaling: https://support.microsoft.com/en-au/office/turn-off-automatic-paper-scaling-7b8af1e8-7b6d-4d6f-9611-0170b53c64c6
- python-docx image dedup: https://github.com/python-openxml/python-docx/blob/master/src/docx/package.py
- Own measurements: generated with `docx` 9.16.0 in Node 24, opened in Microsoft Word (Office 16) via COM. `InlineShape` size and position, table cell widths and borders, and page count were read back.
