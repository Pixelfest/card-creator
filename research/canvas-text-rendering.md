# Canvas text rendering: custom fonts, outlines and colour emoji

Research for [#2](https://github.com/Pixelfest/card-creator/issues/2), part of [#1](https://github.com/Pixelfest/card-creator/issues/1).

**Question:** Can one HTML canvas renderer (editor preview and ~300 DPI print export, 44 x 72 mm, about 520 x 850 px) draw Text snippets with a self-hosted custom font, fill colour, outline colour, size, left/centre/right alignment, multi-line wrapping and colour emoji, consistently across Chrome, Firefox, Safari and Edge?

**Short answer:** Yes for the text itself. Custom fonts, fill, outline, alignment and wrapping are all standard Canvas 2D features that every target browser supports. You have to handle font loading and line wrapping yourself. **Colour emoji are the weak spot.** If they go through `fillText`/`strokeText`, the result depends on the OS's emoji font, the browser's colour-font support, and unspecified stroke behaviour. To get the same output everywhere, split emoji out of the text and draw them as bundled images (Twemoji SVGs), which you never stroke.

---

## 1. Making sure fonts are loaded before drawing

**What the spec says:** Canvas does not wait for fonts. The HTML Standard says that if "a font is used before it is fully loaded", it "must be treated as if it was an unknown font, falling back to another" ([WHATWG HTML, canvas text styles](https://html.spec.whatwg.org/multipage/canvas.html)). A first draw that runs before the font arrives silently uses the fallback font, and nothing tells you it happened.

**API:**
- `new FontFace(family, source, descriptors)`. `source` is either a `url(...)` string or binary data (`ArrayBuffer`). `face.load()` returns a Promise that resolves with the `FontFace` or rejects with `NetworkError`. For binary sources the font is loaded at construction and `load()` does nothing ([MDN FontFace.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFace/load)).
- `document.fonts.add(face)` makes the face visible to the page, including canvas contexts. MDN's canvas example is: create the face, `document.fonts.add`, `await face.load()`, then set `ctx.font` and draw ([MDN FontFace.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFace/load)).
- `document.fonts.load("32px MyFont", text)` forces matching faces to load and resolves with an array of the loaded `FontFace` objects. The `text` argument narrows matching by `unicode-range` only and "does not check for individual glyph coverage" ([MDN FontFaceSet.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load)).
- The API also works in workers via `self.fonts`. A font loaded in a worker is visible only to that worker's contexts (for example an `OffscreenCanvas`), not to the document ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/FontFace/load); [WHATWG HTML](https://html.spec.whatwg.org/multipage/canvas.html)).

**Recommended pattern:**
1. Build a font registry from the repo's font folder at build time (family name to URL).
2. Before rendering a card, collect the snippet fonts it uses. For each one, `new FontFace(uniqueFamilyName, 'url(...)', {weight, style})`, `document.fonts.add`, `await face.load()`, and cache the promise per family.
3. Render only after all of them resolve. On rejection, show an error in the editor. **Never export a card when a font failed to load**, because the fallback font would be printed silently.
4. Quote family names in `ctx.font` (`ctx.font = \`${size}px "${family}"\``). Keep the descriptors (weight/style) you pass to `FontFace` the same as the ones you use in `ctx.font`, or matching falls back to another face.
5. Prefer `await face.load()` on your own `FontFace` objects over `document.fonts.check()`/`ready`. `check()` does not start a load, and `ready` covers only loads that are already pending (see MDN's FontFaceSet pages).

## 2. Wrapping, measuring and alignment

**What the spec says:** Canvas does not wrap text. The text preparation algorithm replaces all ASCII whitespace (newlines included) with U+0020 and lays the text out in a "hypothetical infinitely-wide CSS line box" with `white-space: pre`. `maxWidth` does not wrap. Instead the UA may "change font to have a more condensed font" or "a smaller font" ([WHATWG HTML, text preparation algorithm](https://html.spec.whatwg.org/multipage/canvas.html); [MDN strokeText](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeText)). Each UA picks how it does this, so **do not use `maxWidth` for print layout**.

**Measuring:** `ctx.measureText(str)` returns `TextMetrics`:
- `width` is the advance width.
- `actualBoundingBoxAscent/Descent` give the ink bounds of this particular string.
- `fontBoundingBoxAscent/Descent` give the ascent and descent of the first available font, which is what you want for a stable line height. ([WHATWG HTML, TextMetrics](https://html.spec.whatwg.org/multipage/canvas.html))

**Approach (greedy wrapper, ~50 lines, no library needed):**
1. Split on explicit `\n` into paragraphs, since canvas would turn newlines into spaces.
2. Split each paragraph into break opportunities. `Intl.Segmenter` with `granularity: "word"` handles this, and has been Baseline widely available since April 2024 ([MDN Intl.Segmenter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)). Splitting on spaces is enough for Latin-script card text.
3. Add words while `measureText(line + word).width <= boxWidth`. A single word that is too wide gets broken by grapheme (`granularity: "grapheme"`), so an emoji ZWJ sequence or a flag is never split in half.
4. Line height is `fontSize * lineHeightFactor`, or `fontBoundingBoxAscent + fontBoundingBoxDescent` from a reference measurement.
5. Alignment: draw with `textAlign = "left"` at `x = boxX + offset`, where offset is `0`, `(boxW - lineW)/2` or `boxW - lineW`. Positioning each line yourself also works once emoji are drawn as images (section 4), whereas `textAlign` only knows about text runs.
6. Use `textBaseline = "alphabetic"` and compute baselines from font metrics. This avoids per-browser differences in `"top"`/`"middle"` baseline positions.
7. Measure with the **same** `ctx.font` (and `letterSpacing`, if used) that you draw with. Strokes do not change advances, but stroke width does extend the ink, so inset the text box by half the outline width.

Libraries such as Konva or Fabric include wrapping, but they add weight and their own model. A small, tested wrap function inside our renderer is simpler, and it is fully deterministic because it uses only `measureText`.

## 3. Fill + outline: ordering and joins

- `strokeText` centres the stroke on the glyph outline. Half of `lineWidth` falls inside the glyph and half outside. Fill and stroke are separate draws, and `strokeText` uses only `strokeStyle` ([WHATWG HTML, drawing text](https://html.spec.whatwg.org/multipage/canvas.html); [MDN strokeText](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeText)).
- **Order: `strokeText` first, then `fillText` on top.** The fill then covers the inner half of the stroke, so you get a clean outer outline that does not eat into thin letterforms. Set `lineWidth = 2 * desiredOutlineWidth` to get the visible outline width you want.
- **`lineJoin = "round"`** (default is `"miter"`, `miterLimit` default 10; [WHATWG HTML](https://html.spec.whatwg.org/multipage/canvas.html); [MDN lineJoin](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin)). With miter joins, thick outlines grow sharp spikes at acute glyph corners (M, V, A, W). `"round"` avoids that. If you need crisp corners, use `"miter"` with `miterLimit` around 2. Set `lineCap = "round"` as well.
- Scale outline width with font size (for example as a percentage of size) so the preview and the export look the same.
- Do not use `maxWidth` on either call. Using it on only one of them could misalign stroke and fill.

## 4. Colour emoji

### 4a. With a custom font that has no emoji glyphs
Missing glyphs go through CSS font fallback (WHATWG, as above). The emoji then comes from whatever colour emoji font the **OS/browser** provides, so it looks different on every platform: Apple Color Emoji (macOS/iOS), Segoe UI Emoji (Windows), Noto Color Emoji (Android/ChromeOS/most Linux). The same card would print with different emoji artwork, and different advance widths, depending on the machine that exports it. This alone breaks "identical enough for print".

### 4b. With `strokeText`
The spec does not say how colour glyphs are stroked. Known bugs show the engines disagree:
- **WebKit bug 217557** (open, NEW): "Stroking emoji with a gradient fills the emoji". Safari paints the stroke style over the emoji, which "doesn't match the other browsers" ([bugs.webkit.org/217557](https://bugs.webkit.org/show_bug.cgi?id=217557)).
- Firefox has fixed several colour-glyph canvas bugs in recent years, for example compositing modes other than source-over ([bug 1902253](https://bugzilla.mozilla.org/show_bug.cgi?id=1902253)) and glyphs missing after first being drawn with `globalAlpha=0` ([bug 1912431](https://bugzilla.mozilla.org/show_bug.cgi?id=1912431)). Colour web fonts did not render in canvas at all until Firefox 49 ([bug 1237640](https://bugzilla.mozilla.org/show_bug.cgi?id=1237640)).
- Bitmap emoji (sbix/CBDT) have no vector outline to stroke, so "outline around an emoji" behaves differently from one engine to the next. *Inference: I found no Chromium tracker entry that defines this behaviour, so test it before relying on it.*

**Conclusion: never pass emoji through `strokeText`.**

### 4c. Bundling an emoji web font (Noto Color Emoji)
- `NotoColorEmoji.ttf` in the googlefonts repo is **CBDT/CBLC**. Per the README, macOS supports it "only [in] Chrome", and Windows supports it from Windows 10 Anniversary Update in Chrome/Edge ([googlefonts/noto-emoji](https://github.com/googlefonts/noto-emoji)). Licence: OFL 1.1.
- The **COLRv1** build (served by Google Fonts) works in Chrome/Edge 98+ and Firefox 107+, **but not in any Safari version, desktop or iOS** ([caniuse COLRv1](https://caniuse.com/colr-v1); [Chrome blog](https://developer.chrome.com/blog/colrv1-fonts)). The WebKit tracking bug is still NEW, and Apple said the work would sit in the platform text libraries rather than WebKit ([bugs.webkit.org/233496](https://bugs.webkit.org/show_bug.cgi?id=233496)).
- WebKit also has open COLR issues: colour bleeding into text that follows a Twemoji COLR emoji ([281739](https://bugs.webkit.org/show_bug.cgi?id=281739), reopened for macOS 26 as [304334](https://bugs.webkit.org/show_bug.cgi?id=304334)), and a Noto Color Emoji page taking about 30 s to load in Safari ([305636](https://bugs.webkit.org/show_bug.cgi?id=305636)).
- `@font-face src: ... tech(color-COLRv1)` and `@supports font-tech()` let you choose a format per browser ([MDN @font-face/src](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/src)). However, each browser would then get different files, so output would still not be identical.

**Conclusion:** No single emoji font file renders the same in all four browsers today, so a bundled emoji font cannot guarantee identical print output.

### 4d. Twemoji images drawn inline (recommended)
- [jdecked/twemoji](https://github.com/jdecked/twemoji) is the maintained Twemoji, with Unicode/Emoji 17.0. It ships **SVG** and 72x72 PNG assets named by code point (`twemoji.convert.toCodePoint`). Licence: code MIT, **graphics CC-BY 4.0, which requires attribution** (a README, About page or footer mention is enough).
- **Self-host** the SVGs (copy them into the repo or bundle at build time) instead of loading them from the jsDelivr CDN. Cross-origin images without CORS **taint the canvas**, and a tainted canvas makes `toBlob()`/`toDataURL()` throw `SecurityError` ([MDN CORS-enabled images](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image)). That would break export.
- Use SVG rather than the 72 px PNGs. At 300 DPI a 10 pt emoji is about 42 px, which the PNG would cover, but larger title text would make it blurry.
- Implementation:
  1. Segment the snippet into graphemes.
  2. Classify each one as emoji or text, for example with `/\p{Extended_Pictographic}/u` plus regional-indicator pairs and keycaps.
  3. When measuring, give each emoji a width of about `1.0-1.2 x fontSize` (a fixed advance).
  4. Lay out mixed runs line by line.
  5. Draw text runs with stroke-then-fill.
  6. Draw each emoji with `ctx.drawImage(svgImg, x, y - ascent, size, size)` and no outline.
  7. Preload and `await img.decode()` each SVG before rendering, the same way as fonts.
  8. Strip U+FE0F where Twemoji's filename omits it, and fall back to a text glyph or a placeholder if no asset exists.
- If emoji **must** have an outline, draw the image several times offset in the outline colour with a `source-in` tint on a scratch canvas. That is a later nice-to-have.

## 5. High-DPI and print pitfalls

- **Separate the backing-store size from the CSS size.** The MDN pattern is: `canvas.width = Math.floor(cssW * devicePixelRatio)`, then CSS width `cssW`, then `ctx.scale(dpr, dpr)` ([MDN devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)). Without it, the preview is blurry on Retina and Windows displays at 125/150% scaling. `devicePixelRatio` also changes with browser zoom and when the window moves to another monitor. Listen with `matchMedia('(resolution: Xdppx)')`.
- **Use one renderer in card units.** Write the renderer in millimetres (or a fixed 520 x 850 card coordinate space) and apply a single `ctx.scale(pxPerUnit)`:
  - Export: a fixed pixel size for 300 DPI, with no `devicePixelRatio` involved (44 mm is 519.7 px and 72 mm is 850.4 px, so use 520 x 850 and document the rounding).
  - Preview: `displayWidth * devicePixelRatio`.

  Font size, outline width and wrap width all scale together, so the wrap points are the same in both outputs. *Caveat: hinting and subpixel positioning can change `measureText` widths slightly at different scales, which can move a line break when a line is very close to the box width. To guarantee identical breaks, compute layout once at export resolution and reuse those line breaks when drawing the preview.*
- **Consider exporting larger than 300 DPI** (for example 600 DPI, 1040 x 1700) if the printer accepts it. Text edges come out crisper and the canvas is still small. Canvas size limits (the iOS/Safari area cap is around 16.7 M px) are nowhere near this.
- Use `fontKerning` (default `"auto"`) and `textRendering` (default `"auto"`) consistently, and leave `letterSpacing` at `"0px"` unless the feature needs it ([WHATWG HTML](https://html.spec.whatwg.org/multipage/canvas.html)). Check per-browser support on MDN before using `letterSpacing`/`wordSpacing`.
- Images drawn into the canvas, including emoji SVGs, must be same-origin or CORS-enabled, or export breaks (section 4d).
- Cross-browser output will be **visually equivalent, not pixel-identical**. Anti-aliasing and hinting differ by engine and OS. That is acceptable for print at 300 DPI and above, but it means regression tests should compare layout data (line breaks, positions), not exact pixels across browsers.

## 6. Recommendation

1. **Canvas 2D is viable** as the single renderer for both preview and export. Write all drawing in card units, with one scale factor for preview (with devicePixelRatio) and for export (fixed 300 DPI or higher).
2. **Fonts:** load every snippet font explicitly with `FontFace` + `document.fonts.add` + `await load()`. Use self-hosted WOFF2 from the repo folder, with a build-time manifest. Block rendering, and especially export, until all fonts resolve. Fail loudly instead of printing the fallback font.
3. **Text layout:** write our own small wrapping module.
   - Split on `\n`, wrap greedily with `measureText`, and break by grapheme with `Intl.Segmenter`.
   - Do the alignment math per line, and use `alphabetic` baselines with line height derived from font metrics.
   - Never use `maxWidth`.
   - Compute the layout once and share it between preview and export.
4. **Outline:**
   - Draw `strokeText` first, then `fillText`.
   - Set `lineWidth = 2 x outline`, `lineJoin = "round"` and `lineCap = "round"`.
   - Make outline width proportional to font size.
5. **Emoji:** do **not** depend on system or web emoji fonts.
   - Bundle Twemoji SVGs (CC-BY 4.0; add attribution) in the repo.
   - Segment each snippet into text and emoji runs, and draw emoji with `drawImage` from same-origin URLs, with no stroke.
   - This is the only option found that gives the same emoji artwork in Chrome, Edge, Firefox **and** Safari on every OS, and keeps export untainted.
   - Rejected: system emoji (differs per OS, and Safari stroking is buggy) and Noto Color Emoji as a web font (CBDT and COLRv1 are each unsupported somewhere, and Safari has no COLRv1).
6. **Testing:** add a small fixture card (custom font + outline + wrapped centre/right text + ZWJ emoji + flag). Check it manually in all four browsers once. Then assert layout data (line breaks, run positions) in unit tests, rather than comparing pixels across browsers.

### Open points / not verified
- Exact Chromium/Firefox behaviour of `strokeText` on colour emoji. I found no primary-source definition. The recommendation avoids the question.
- Per-browser support for `ctx.letterSpacing`/`wordSpacing`. Check MDN compat before exposing letter spacing as a feature.
