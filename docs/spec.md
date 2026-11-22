# Card Creator v1: spec

A public web app for designing custom board-game cards in **Sets**, grouped in **Collections**, and exporting them to an A4 PDF for printing. Terms are defined in [`CONTEXT.md`](../CONTEXT.md); use them.

This spec consolidates the decisions on the [wayfinder map](https://github.com/Pixelfest/card-creator/issues/1). Each section links the ticket that holds the reasoning.

- Targets: Chrome, Firefox and Edge. Safari is not supported.
- Production only: `cards.heavyroad.nl`. There is no staging environment.
- No accounts and no personal data. The Collection URL is the only key.

---

## 1. Architecture

Decided in [Tech stack and architecture](https://github.com/Pixelfest/card-creator/issues/5).

| Layer | Choice |
|---|---|
| Backend | .NET 10, ASP.NET Core minimal APIs, EF Core + Npgsql. Migrations apply automatically on startup, with one DB user |
| Database | PostgreSQL 17 |
| Frontend | React + TypeScript (Vite), Zustand for editor state, TanStack Query for server calls, CSS Modules, no component library |
| Packaging | One app image: a multi-stage Dockerfile builds the frontend into .NET's `wwwroot`. Same origin, no CORS |
| Artwork | Files on a Docker volume (`/data/artwork`), named by id. The DB holds metadata only |
| Tests | Vitest for the frontend, xUnit + Testcontainers (PostgreSQL) for the API |

Suggested repo layout: `src/server/` (.NET), `src/web/` (Vite), `assets/`, `deploy/`, `docs/`.

## 2. Data model and API

The shape is fixed here; each build ticket defines the exact endpoints it needs.

```
collections   (id, name, created_at, created_ip)
sets          (id, collection_id, name, card_format, created_at, updated_at)
cards         (id, set_id, position, name, copies, design jsonb, version, updated_at)
artwork_files (id, collection_id, path, content_type, created_at, last_referenced_at)
```

- Ids for Collections, Sets and Cards: 128-bit random, base62, 22 characters.
- `design` (jsonb) holds the fill colour, the Frame asset path, the Artwork reference and transform, and the Text snippets. The server never queries inside it.
- `card_format` is `44x72` (the only format). It is locked once the Set has its first Card.
- The REST API sits under `/api`. Collection-scoped resources nest under `/api/collections/{collectionId}/…`. Every Set or Card request checks that the resource belongs to that Collection.
- Saving a Card is a `PUT` carrying the version it was based on. A stale version returns `409` with the current Card.
- Errors are ASP.NET Core ProblemDetails JSON, logged to the console (`docker logs`).
- The server never lists Collections.

## 3. Collections and Sets

Decided in [Set lifecycle and card management](https://github.com/Pixelfest/card-creator/issues/8) and [Editor and Collection UI](https://github.com/Pixelfest/card-creator/issues/11).

**Home page `/`**
- Shows **New collection** only to allowlisted client IPs. Everyone else sees a note that they need a Collection link.
- The allowlist is the config key `CollectionCreation:AllowedIps` (env `CollectionCreation__AllowedIps__0=…`). The server enforces it, not only the UI.
- Shows **Recently opened** Collections, stored only in the browser's localStorage.

**Collection page `/c/{collectionId}`**
- Editable name (default "Untitled collection"), **New set**, **Copy collection link**.
- A table of Sets with: name (editable in place), card count, last changed, Open, **Duplicate** and **Delete**.
- Duplicate copies the Set and its Cards. The copies share Artwork files.
- Delete asks you to type the Set name to confirm, and cannot be undone.
- Collections cannot be deleted.

**Sets**: URL `/c/{collectionId}/s/{setId}`, editable name (default "Untitled set"). The name is used as the tab title and the export file name.

## 4. Cards

- The card list's order is the export order.
- **Add** creates "Card N" with 1 copy, a white fill, the first available Frame, no Artwork and no snippets.
- **Duplicate** copies everything and appends " (copy)" to the name.
- Reorder by drag and drop. Delete asks for confirmation. Rename in the name field.
- **Copies** is an integer ≥ 0. A Card with Copies 0 is never exported.
- There is no limit on the number of Cards per Set.

## 5. Asset library

Decided in [Asset library conventions](https://github.com/Pixelfest/card-creator/issues/6).

```
assets/
  frames/44x72/*.png
  fonts/*.woff2 | *.ttf | *.otf
  snippet-backgrounds/*.png
  icons/*.png           (corner icons, any size)
  backs/*.png           (Card Backs, any size)
  emoji/                (Twemoji SVGs)
  CREDITS.md            (optional)
```

- The assets are copied into the image. The backend scans them at startup and serves a manifest at `/api/assets`, grouped by type.
- Asset URLs carry a content hash, so they can be cached long-term.
- Frames are PNG at a 44:72 ratio (ideal 520×850 px). A Frame more than about 1% off that ratio is skipped with a log warning.
- Backs are PNG of any size; they print scaled to cover the Back area, centred. Ideal: 48:76 at 300 DPI (567×898 px for a 44 mm Card).
- One font file is one selectable font, except that files differing only in extension are one font: the browser draws the `.woff2` (else `.ttf`, else `.otf`) and the PDF export embeds the `.ttf` (else `.otf`), since PDF viewers cannot read WOFF2.
- Display names come from file names: `gold-ornate.png` → "Gold ornate".
- **Missing assets:** a Card stores asset paths. If a file disappears, the Card keeps the path and the editor renders without it, using a fallback font for a missing font. The Card shows ⚠ in the card list and a note on the affected control. Export still works and lists the warning.
- **Credits** is a footer link to a page with Twemoji's CC-BY 4.0 attribution plus `assets/CREDITS.md`.

## 6. Card rendering

Decided in [Canvas text rendering](https://github.com/Pixelfest/card-creator/issues/2) and [Text snippet layout model](https://github.com/Pixelfest/card-creator/issues/7). Research: [`research/canvas-text-rendering.md`](https://github.com/Pixelfest/card-creator/blob/research/canvas-text-rendering/research/canvas-text-rendering.md).

**One renderer for the preview and the export.** It is Canvas 2D, written in card units with one scale factor.
- The export renders at 520×850 px (300 DPI) and ignores `devicePixelRatio`.
- The preview uses `cssSize × devicePixelRatio`.
- Layout (line breaks, box positions) is computed by pure functions that are tested on their data, not on pixels.

**Draw order (bottom → top):** fill colour, Artwork, Frame, corner icons, then the textbox, banner and header snippets. Each snippet draws its background, then its text.

**Artwork**
- Formats: JPG, PNG, WebP.
- Initially scaled to cover the Card. The user can then pan and zoom freely, and any uncovered area shows the fill colour.
- **Reset to cover** restores the initial fit.

**Corner icons:** one icon from `assets/icons/`, drawn in any ticked combination of the four corners. They draw above the Artwork and Frame and below the snippets, clipped to the Card. Stored in the design as the optional `cornerIcons` field `{ icon, corners, size, insetY, insetX }`; a Card without it shows no corner icons.
- **Size** is the icon's width as a percentage of the Card (frame) width, 2–40%, default 10%, independent of the image's own pixel size. The height follows the image's aspect ratio. The icon is anchored at its outer corner, so a bigger size grows towards the middle of the Card.
- **Distances** from the top/bottom edge (percentage of Card height) and from the side edge (percentage of Card width), 0–20%, default 0% each (flush in the corner), measured from the Card edge and mirrored per corner. The icon is never flipped or rotated.
- Size and distances are shared by every ticked corner, as is the icon. A missing icon is skipped and the Card gets a missing-asset warning (only while a corner is ticked).

**Text snippets:** at most one per slot (`header`, `banner`, `textbox`).
- The box is horizontally centred. Its width is card width × zoom (25–200%).
- Vertical position is the box centre, 0–100% of card height. Anything past the card edge is clipped.
- Height: with a Snippet background, width × the background's aspect ratio (the background fills the box). Without one, the height fits the text.
- Inside the box: horizontal padding of 5% of box width, vertical padding of 0.2 × the font size above and below (8% of box height with a Snippet background), the text block vertically centred, line height 1.2, and left/centre/right alignment.
- Text size is in pt (5–36). Defaults: textbox 9 pt, header and banner 12 pt.
- **Overflow:** text that doesn't fit auto-shrinks to as little as 50% of its size. Past that it overflows and the snippet gets a "text doesn't fit" warning.
- **Outline:** on or off, with a colour and a thickness (2–30% of the font size, default 12%). Draw it with `strokeText` (`lineWidth = 2 × outline`, `lineJoin = "round"`), then `fillText`.
- **Slot defaults when added:** header 6% / 80%, banner 16% / 90%, textbox 80% / 85% (vertical centre / zoom).
- **Fonts:** load every font with `FontFace` → `document.fonts.add` → `await load()` before rendering or exporting. A font that fails to load is reported, never drawn silently in the fallback.
- **Wrapping:** a custom greedy wrapper. Split on `\n`, measure with `measureText`, and use `Intl.Segmenter` for word and grapheme breaks.
- **Emoji:** split the text into text and emoji runs. Draw emoji as bundled same-origin Twemoji SVGs with `drawImage`.
  - When the snippet has an outline, an emoji gets a black silhouette behind it (offset copies or a dilate filter).
  - If that proves unreliable, drop the emoji outline.

## 7. Editor

Decided in [Editor and Collection UI](https://github.com/Pixelfest/card-creator/issues/11). The prototype, variant D on branch [`prototype/editor-ui`](https://github.com/Pixelfest/card-creator/tree/prototype/editor-ui/prototype/ui-editor), is the visual reference. Its code is throwaway.

- **Header bar:** back to the Collection, editable Set name, Undo / Redo, save status, Copy link, **Export…**.
- **Left, the card list:** drag handle, name, ⚠, ×Copies, Duplicate, Delete, and **+ Add card**. Clicking a card selects it.
- **Centre:** the selected Card, large, on a dark workspace.
  - Drag the Artwork to pan it.
  - Drag a snippet to move it vertically.
  - Use the scroll wheel to zoom the part under the pointer.
  - Click a part to select it.
- **Right:** a column of part buttons (Card, Artwork, Frame, Corner icons, Header, Banner, Textbox; an empty slot shows "+") beside the selected part's properties.
  - **Card:** name, Copies.
  - **Artwork:** upload, zoom, pan X/Y, fill colour, reset to cover.
  - **Frame:** visual tiles, plus a warning if the Frame is missing.
  - **Corner icons:** icon tiles (plus None), a tick box per corner, and size and distance sliders, each with a number box. Sliders preview while held and save on release; there is no drag on the card.
  - **Snippet:** text, font (each previewed in itself), size, colour, outline on/off + colour + thickness, alignment, background, vertical position, zoom, remove, and the doesn't-fit warning.

## 8. Saving, undo and redo

Decided in [Save, undo and redo semantics](https://github.com/Pixelfest/card-creator/issues/9).

**A change is saved when it is finished:**
- text fields on blur
- drags and sliders on pointer release
- pickers on pick
- colour pickers on close
- Artwork on upload completion

Pending saves are flushed on page leave.

**Undo and redo**
- One history per Set editor, covering all Cards, including add, duplicate, delete and reorder. One finished change is one step.
- The last 100 steps are kept in memory. The history is cleared on reload or when switching Set.
- Undo/redo selects the affected Card and saves the result like any other change.
- Shortcuts: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z, except inside a focused text field.
- Collection-level actions are not undoable.

**Concurrent edits**
- Each Card carries a version. On a `409` the user chooses "load their version" or "keep mine" (which overwrites).
- The editor re-fetches the Set when the tab regains focus.

**Save status:** "Saving…", "All changes saved" or "Couldn't save, retrying".
- Failed saves retry with backoff and the changes stay in memory.
- Leaving with unsaved changes triggers the browser's leave-page warning.

## 9. Artwork upload and storage

- JPG, PNG or WebP, detected by content, maximum 10 MB. The client checks first and the server enforces.
- The server applies the orientation, strips all metadata (EXIF, GPS, …) and re-encodes in the same format at high quality, without resizing.
- Duplicated Cards and Sets share Artwork files.
- A daily background job deletes Artwork files that no Card has referenced for 30 days.

## 10. Export to PDF

Decided in [Export details](https://github.com/Pixelfest/card-creator/issues/10) and [Generating an A4 .docx](https://github.com/Pixelfest/card-creator/issues/3). Research: [`research/docx-export.md`](https://github.com/Pixelfest/card-creator/blob/research/docx-export/research/docx-export.md).

**Generation:** in the browser, with the `pdf-lib` npm package, loaded on first export. A Word (.docx) export existed earlier; it was removed in [#61](https://github.com/Pixelfest/card-creator/issues/61) to cut maintenance.

**Print size**
- The Cards print at a chosen width, 25–120 mm (default 44 mm). The height follows from the Card Format's 44:72 ratio, so the design is scaled, never stretched.
- The printed card is the Card plus a 2 mm white cut border; cards are 2 mm apart (4 mm when double-sided, see Backs).
- The grid is the one that fits the most cards on A4 within 5 mm minimum page margins, in portrait or landscape (portrait wins a tie). At 44 mm that is 4 × 3 portrait; at 57 mm, 4 × 2 landscape.

**Layout**
- A grid of printed-card slots with 2 mm gaps, centred on the page. At 44 mm: 4 × 3 slots of 48×76 mm, about 6 mm side margins and 32.5 mm top/bottom.
- Each card image (the Card plus its 2 mm white cut border) is drawn at its slot.
- **Cut lines:** a ¼ pt black rectangle on the edge of each card image.

**PDF**
- Each unique image is embedded once and drawn for every Copy.
- Snippet text is not in the PDF's card image: it is drawn on top as real text in the snippet's embedded font (whole font files, via `@pdf-lib/fontkit`), at the same positions as the canvas layout, clipped to the Card, so it prints sharp. Outlines are a stroke at twice the outline width with round joins, drawn before the fill, as on the canvas. Snippet backgrounds and emoji stay in the image. A snippet on the fallback font (its font missing or failed), or on a font with no `.ttf`/`.otf` file, stays in the image too. Because the image is underneath, a snippet's text is drawn above every snippet background, even one that is higher in the draw order.

**Backs (double-sided)**
- A Card may have a **Back** (Back part in the editor: tiles from `assets/backs`, None by default). The stage only ever shows the front.
- The PDF is double-sided when at least one printed Card has a Back the library has. Each front page is then followed by its back page, so fronts are on odd pages and Backs on even pages; every front page gets a back page, even an empty one.
- The sheet always turns over its **long edge**, in landscape too: printers align the two sides well only in that direction. So on the back page each Back sits in the mirrored column of the same row in portrait, and in the mirrored row of the same column in landscape.
- A Back reaches 2 mm past its front's cut line on every side (the Card plus 4 mm), so a front/back misalignment of up to 2 mm doesn't show the cut line. It is clipped to that area. No cut lines and no text on back pages.
- To fit that overhang, a double-sided PDF puts the cards 4 mm apart instead of 2 mm and keeps the Backs, not just the fronts, inside the 5 mm minimum margins. At 44 mm that is 5 × 2 landscape (10 per page) instead of 4 × 3 portrait.
- A Card without a Back, or with a Back missing from the library, leaves its place blank. Each unique Back is embedded once.

**Content**
- Each Card renders once as a PNG of at least 300 DPI: 520×850 px, scaled up for Cards wider than 44 mm, plus the cut border (568×898 px in all at 44 mm). The buffer is reused for its Copies.
- Cards appear in card-list order, with each Card's Copies consecutive. Copies 0 is excluded.

**Dialog**
1. A checkbox per Card, all checked by default. Copies-0 Cards are unchecked and disabled.
2. The Card width in mm, with the resulting height, the cards per page and the orientation, and a reset to 44 mm. The last width used is remembered in this browser. An empty or out-of-range width blocks the export. A running total of cards and pages; when double-sided, the pages include the back pages, followed by the sheets ("13 cards on 4 pages (2 sheets, double-sided)").
3. Warnings (missing assets, text that doesn't fit) for the selected Cards, with **Export anyway**.
4. The reminder "Print at 100% / Actual size: don't use Fit to page", and when double-sided "Print double-sided, flip on long edge." (in either orientation).
5. A progress bar, then the download `{Set name}.pdf`.

## 11. Errors and offline

- **Artwork upload too big or wrong type:** the client refuses it before uploading. The server returns 400/413 ProblemDetails.
- **Upload fails:** an inline error on the Artwork panel with **Retry**. The Card is unchanged.
- **Export fails:** an error in the dialog with **Retry**. Nothing is downloaded.
- **A font fails to load:** the editor shows a warning on the snippet, and export lists it in the warnings step.
- **Offline:** there is no offline mode. The save status line handles retries. Upload and export are disabled while `navigator.onLine` is false.

## 12. Testing

- **Vitest** covers the pure logic:
  - the text wrapper and auto-shrink
  - snippet box geometry
  - Artwork cover and pan/zoom maths
  - the undo history
  - export pagination and Copies expansion
  - asset display names
- **xUnit with Testcontainers PostgreSQL** covers the API:
  - the allowlist and forwarded headers
  - Collection scoping
  - version conflicts
  - upload validation and metadata stripping
  - the Artwork purge
- There are no browser end-to-end tests in v1. Each UI ticket has a manual checklist.
- A GitHub Actions workflow runs both suites on every PR.

## 13. Deployment

Decided in [Server facts for deployment](https://github.com/Pixelfest/card-creator/issues/4) and [Deployment and release script](https://github.com/Pixelfest/card-creator/issues/12).

**Host:** Windows with Docker (WSL 2). The owner's nginx terminates TLS and proxies `cards.heavyroad.nl` to `127.0.0.1:8100`.

**`docker-compose.yml`**
- `app`: built on the server from the clone with `ASPNETCORE_ENVIRONMENT=Production` and `env_file: deploy/production.env`.
  - Published as `127.0.0.1:8100:8080`.
  - Volume `cardcreator_artwork_prod` at `/data/artwork`, pre-created and owned by `$APP_UID`.
  - `depends_on` postgres healthy, `restart: unless-stopped`, and a `/health` endpoint.
- `postgres`: `postgres:17-alpine` with a `pg_isready` healthcheck. Volume `cardcreator_pgdata_prod`. No host port.

**Forwarded headers:** ASP.NET Core ForwardedHeaders trusts only the Docker gateway network, so the allowlist sees real client IPs. `deploy/nginx.example.conf` documents `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.

**Secrets:** a gitignored `deploy/production.env` (with a committed `.example`) holds the Postgres password, the connection string, the allowlist, the backup folder and retention. `appsettings.Production.json` contains no secrets.

**`deploy/release.ps1`**
1. Refuse to run if the working tree is dirty.
2. `git fetch`, then check out `main` (or `-Ref`).
3. Run `backup.ps1`.
4. `docker compose build` and `up -d`.
5. Poll `/health` for up to about 60 s. On failure, print the logs, print the restore command, and exit non-zero.

There is no rollback.

**`deploy/backup.ps1`**
- `pg_dump` (custom format) via `docker compose exec`, plus a tar of the Artwork volume through a helper container.
- Each backup is verified, and backups older than the retention (default 14 days) are pruned.
- Runs daily via Task Scheduler. Setup is in `deploy/README.md`.

**Local development:** `docker-compose.dev.yml` runs only Postgres, on port 5435. Run `dotnet run` and `npm run dev`, with Vite proxying `/api`.

## Out of scope for v1

Automated rollback; staging; Safari; Card formats other than 44×72; view-only links; deleting Collections; card backs and double-sided printing; PDF/PNG export and 600 DPI; inline icons beyond emoji; auto-deleting Sets; user accounts.
