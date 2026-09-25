# Work Plan — Late Blight / CDM Detection Map

This is the living plan for the project. **Update the checkboxes and status lines as work lands**,
so progress survives between sessions. Architecture rules live in `CLAUDE.md`; this file tracks
_what is being built next and how far along it is_.

The original Phase 0–6 plan (prerequisites, architecture rationale, per-track acceptance
criteria) was written outside the repo at `~/.claude/plans/i-want-to-create-logical-scroll.md`.
Its durable lessons have been folded into `CLAUDE.md`; the summary below is enough to continue.

---

## Status at a glance

| Phase | Scope                                                  | Status                                      |
| ----- | ------------------------------------------------------ | ------------------------------------------- |
| 0     | Prerequisites (Postgres roles, GitHub, Chromium libs)  | ✅ Done                                     |
| 1     | Scaffold                                               | ✅ `91febfb`, `e7b915f`                     |
| 2     | Schema (A), geodata (B), shell + symbology (C)         | ✅ `f626b95`, `57c596f`                     |
| 3     | Auth (D), public data layer (E), map (F)               | ✅ `bcdc73c`, `91ea71e`                     |
| 4     | Feed + map/feed linking (G), admin CRUD (H)            | ✅ `c0ea24c`, `be51bff`                     |
| **5** | **Polish — see below**                                 | 🟡 **All tracks ✅; one manual pass left**  |
| 5½    | Accounts: roles, invitations, attribution (5H)         | ✅ Done, follow-ups included                |
| 6     | Deploy (systemd, reverse proxy, backups, health check) | 🟡 Staging scripted; one-time setup pending |
| 7     | Public detections table + shared nav (Track 7A)        | ✅ Done (uncommitted as of 2026-09-25)      |

Phase 6: staging first (below), on the AgWeather dev server, for stakeholder feedback.
The production host is still undecided; it needs the production Postgres arrangement and a
`pg_dump` backup destination. The deploy must set
`ADDRESS_HEADER` (and `XFF_DEPTH` if it's `X-Forwarded-For`) for the reverse proxy — see
`.env.example`; without it every client shares one sign-in rate-limit bucket.

---

## Phase 5 — Polish

Tracks are grouped into waves. Tracks within a wave own disjoint files and can run in parallel;
a later wave may touch files an earlier wave owned.

### Decisions

Settled 2026-09-22 unless marked open.

- **D1. Callouts are county labels with leader lines**, turned on by a "Label counties with
  detections" toggle. Their purpose is **preparing the map for a screenshot** in a weekly
  extension newsletter — so legibility and control over placement matter more than automation.
- **D2. The recency slider affects labels only.** It appears once labelling is on. The
  choropleth and feed keep showing the full disease-year.
- **D3. At most 10 labels**, the 10 most recent counties on or after the slider date, one label
  per county (its latest detection). When more qualify, the panel says "Showing 10 of 14".
- **D4. No view state in the URL.** Reverses the Phase 1 "URL is the state" rule — see Track 5S.
  The page always opens in the default view; a **Share** button builds a link that reproduces
  the current view, and those parameters are stripped from the address bar on arrival.
- **D5. Only counties with detections are selectable.** Clicking an empty county clears the
  selection and nothing else.
- **D6. CSV import accepts FIPS or state + county names**, resolved against `counties`. A row
  that is ambiguous or unmatched is an error. Never guess.
- **D7. CSV import never silently creates duplicates.** Rows match existing detections on
  **disease + county + observed date** (or on `id` when present). Differences in the other
  fields are resolved per row: keep existing / keep new / keep both. See Track 5D.
- **D8. Detections get a public ID separate from the database key.** The integer primary key
  stays internal (admin URLs, `audit_log`, foreign keys). A new `public_id` — 5 characters,
  random — is what appears in the CSV (as `id`, in one format for everyone) and what import
  matches on. See "Public ID" in Track 5D.
- **D9. Branding reads "University of Wisconsin–Madison"** (en dash), linking to
  `https://www.wisc.edu`.
- **D10. The control panel is an accordion**: a slim bar that expands in place, pushing the
  map and feed down rather than overlaying them.
- **D11. Built-in "Save map image" — yes.** Track 5F. Because of it, 5C keeps label
  geometry as data rather than only as DOM positions.

### Wave 0 — do first; it changes how every later track reads state

#### Track 5S — View state out of the URL; Share links — ✅ DONE

Owns `src/lib/state/view.svelte.ts` (new), `src/lib/state/selection.svelte.ts`,
`src/routes/api/view/+server.ts` (new), `src/routes/+page.server.ts`, `src/routes/+page.svelte`,
`src/lib/components/shell/Header.svelte`, `src/lib/components/DetectionFeed.svelte` (props
only), `e2e/**`, and the "URL is the state" section of `CLAUDE.md`.

Design:

- One runes module, `view.svelte.ts`, owns disease, year, selected county, and label settings.
  Components read and write it; nothing else holds view state.
- **Arrival:** `+page.server.ts` still reads `disease`, `year`, `county`, `labels`, and `since`
  from the query string. That is how a share link opens server-rendered in the right view.
  After hydration the page calls SvelteKit's `replaceState` to drop them, leaving a clean `/`.
- **After arrival:** changing disease or year fetches `GET /api/view?disease=&year=`, which
  returns `{ years, aggregates, detections }` from the existing query functions. The fetch
  lives in `view.svelte.ts` only, never in components. Abort a stale request if the user
  switches again before it returns, and show a loading state rather than stale colours.
- **Share button:** builds a link with every non-default setting and copies it to the
  clipboard, with a visible "Link copied" confirmation. If the Clipboard API is unavailable,
  select the link in a text field instead. The label date goes in as an **absolute date**
  (`since=2026-09-15`), not "last 7 days", so a link opened next week shows the same labels.

Consequences, accepted:

- Back/forward no longer step through disease/year changes, and refresh returns to the
  default view. This is the Shiny-style behaviour the user asked for.
- The disease tabs become buttons, not links, so switching disease no longer works without
  JavaScript. The default view still renders server-side.
- The admin area keeps its query-string filters. This change applies only to the public map.

Tasks:

- [x] `view.svelte.ts` + `/api/view` endpoint. Both it and the page `load` go through
      `loadView()` in `$lib/server/view.ts`. The endpoint sends `no-store` rather than a short
      cache: an admin checking a detection they just saved must not see a stale response.
- [x] Arrival-then-strip in `+page.svelte`; Header and feed switch to the view module.
- [x] `ShareButton.svelte`, in the header **for now**. 5C moves it into the slim control bar.
      Falls back to a selectable text field when the Clipboard API is refused (it needs a
      secure context).
- [x] Rewrite `CLAUDE.md` "The URL is the state" to describe this model.
- [x] e2e: arrival tests unchanged; URL assertions replaced; added clean-URL, year-switch,
      empty-county share link, and a Share → clipboard → fresh-page round trip. 29/29 green.
- [ ] **Moved to 5C:** parsing `labels`/`since` on arrival and putting them in share links.
      They belong with the label UI, which doesn't exist yet.

Notes from implementation:

- `replaceState` must run in `afterNavigate` (type `enter`), not `onMount`. From `onMount`
  it throws `Cannot read properties of undefined (reading '$set')` inside SvelteKit, and
  only the map test's `pageerror` listener caught it.
- Fixed a bug that predated this track, in `DetectionMap.svelte`: the fly-to effect tracked
  `aggregates`, so every disease/year change replayed the last fly request and overrode
  `fitToData`. Detections in the new view could end up off-screen. Now `untrack`ed.
- A share link naming a county with no detections arrives with nothing selected (D5).
- The header title is a full-reload link back to `/`, i.e. "reset to a fresh visit".

**Acceptance:** opening a share link lands in the exact view with a clean address bar; the
default URL is always `/`; switching disease/year never shows the previous year's colours.

### Wave 1 — three parallel tracks

#### Track 5A — Chrome: branding bar, dark mode, sign-in link — ✅ DONE

Owns `src/app.html`, `src/routes/+layout.svelte`, `src/lib/components/shell/BrandBar.svelte`
(new), `src/lib/components/shell/Header.svelte`, `src/lib/state/theme.svelte.ts` (new).

- [x] Thin branding bar above the app header: "University of Wisconsin–Madison", white text on
      `#c5050c` (≈5.9:1 contrast, passes AA), linked to wisc.edu. Same red in both themes — a
      brand colour, not a theme token. Define it as `--brand-uw` in `layout.css`.
- [x] Sun/moon toggle at the far right of the branding bar. Initial theme from
      `prefers-color-scheme`; a click stores an explicit choice in `localStorage` (wrapped in
      try/catch). Toggles the existing `.dark` class — the tokens are already defined.
- [x] **No flash of the wrong theme:** a tiny inline script in `app.html` sets `.dark` before
      first paint. Without it, dark-mode users see a white flash on every load.
- [x] Expose the resolved theme from `theme.svelte.ts` as a rune (`theme.current`) — Track 5B's
      map repaint subscribes to it. **Agree this interface before both tracks start.**
- [x] ~~Follow OS changes live while the user has not made an explicit choice.~~ Dropped
      in 5G: light is the default, whatever the OS says.
- [x] **Sign-in link.** `/login` exists but nothing links to it. Add a low-key "Sign in" link
      in the branding bar (left of the toggle); when signed in it becomes "Administration" +
      a POST sign-out button. Move the existing "Administration" link out of `Header.svelte`.
- [x] Hand-roll the theme module (~40 lines) rather than adding `mode-watcher`.

**Acceptance:** first paint is already in the right theme (check with throttled CPU); toggle
persists across reload; keyboard-reachable with a label that says what it will switch to.

#### Track 5B — Map interaction: floating controls, selection rules, tooltips — ✅ DONE

Owns `src/lib/components/DetectionMap.svelte`, `src/lib/map/**`, `scripts/build-geo.ts`,
`static/geo/**` (regenerated only).

- [x] **Floating controls, top-left:** "Reset view" (the default extent _after_ `expandExtent`,
      i.e. exactly what `fitToData` computes today) and "Zoom to detections" (bounds of the
      detection counties). Svelte overlay buttons with lucide icons, not MapLibre `IControl`s,
      so they share the design system. Disable "zoom to detections" when there are none.
- [x] Zoom-to-detections uses county **bounding boxes**, not interior points, and caps the zoom
      (~7) so a single detection doesn't zoom to street level.
- [x] Move the "basemap unavailable" / "map could not be displayed" notices (currently top-left)
      to bottom-centre so they don't collide with the new controls.
- [x] **Only counties with detections are selectable** (D5). Check `byFips` in the click
      handler; pointer cursor only over counties with data (switch `mouseenter`/`mouseleave` to
      a `mousemove` that reads the hovered feature). This also retires the accessibility gap
      "empty counties are unreachable by keyboard" — they no longer need to be reachable.
- [x] **Hover tooltips** via a MapLibre `Popup` (no close button, `closeOnClick: false`) that
      follows the pointer. Empty county: **"Riley County, Kansas"** / "No detections in 2026"
      (the _selected_ year). With data: name, "3 detections", and the most recent detection's
      date · crop · strain, omitting null fields rather than printing "—".
- [x] The latest detection's crop/strain come from the already-loaded detections (newest
      first): build a `fips → latest Detection` map client-side. **No new query.**
- [x] Full county and state names: the TopoJSON carries only `name` ("Riley") and
      `state_usps`. Add `namelsad` ("Riley County", "Orleans Parish", "Richmond city") and
      `state_name` in `build-geo.ts` and regenerate with `pnpm build:geo`. Check the counties
      file stays well under 2 MB. Never hand-edit `static/geo/`.
- [x] Touch devices have no hover: a tap on an empty county shows the tooltip; a tap on a
      detection county selects it (the feed shows the detail).
- [x] **Theme-aware repaint** (depends on 5A's `theme.current`). Colours are resolved once at
      `addLayer` time, so today a theme switch would leave light-mode colours on a dark page.
      On theme change: re-run `resolveToken()` for every layer and `setPaintProperty`. The
      basemap needs a dark style too — add `PUBLIC_BASEMAP_STYLE_URL_DARK` (default OpenFreeMap
      `dark`). `setStyle()` wipes custom sources and layers, so re-add them and re-apply feature
      state afterwards (the `styledata` pitfall the original plan warned about). Keep all of this
      inside `basemap.ts` + one re-init path — do not scatter theme checks.
- [x] Cleanup: `fillColorExpression()` has two stacked doc comments; delete the stale one.

**Acceptance:** screenshot-verified in both themes, with and without `PUBLIC_BASEMAP_STYLE_URL`;
the MapLibre `error` handler logs nothing after a theme toggle; e2e: clicking an empty county
selects nothing; hovering shows the right year text.

Notes from 5A/5B implementation:

- Sign-out moved from the admin header into the branding bar, so there is one on every page.
  The admin header keeps the signed-in email.
- The brand bar is `--brand-bar-h` tall; full-height pages size to
  `calc(100dvh - var(--brand-bar-h))`, not `h-screen`, or they scroll by the bar's height.
- `fallbackStyle()` had a literal `oklch()` background, which is the kind of colour MapLibre
  silently rejects. It now resolves a new `--map-background` token.
- `PUBLIC_BASEMAP_STYLE_URL_DARK` added. When it's unset, dark mode uses OpenFreeMap Dark only if
  the light style is the default (spelled out or not); a custom light style is reused instead.
- **Layer order:** data layers go after the _last non-label_ basemap layer, not before the
  first label. OpenFreeMap Dark has an early label layer, and roads were drawing over the
  county fills.
- A theme change calls `setStyle(…, { diff: false })` and rebuilds the data layers on
  `style.load`. Map event handlers are registered map-wide and look the layer up at event time,
  so they survive the rebuild.
- `data-map-settled` on the map container marks "county source loaded and not moving". e2e
  waits on it instead of fixed sleeps. It deliberately isn't `idle`, which waits on every
  third-party basemap tile.
- Topology now carries `name` = NAMELSAD and `state_name`; `state_usps` was unused and dropped.
- Known, not fixed: the legend (bottom-left) can cover a detection county after "zoom to
  detections" or at the default extent. Revisit in 5E or with the control panel.

#### Track 5D — CSV export and admin import — ✅ DONE

Owns `src/lib/csv/**` (new), `src/routes/detections.csv/+server.ts` (new),
`src/routes/admin/import/**` (new), `src/lib/server/queries/admin.ts` (adds functions),
`src/routes/admin/incidents/new/**` (duplicate warning only), `src/lib/server/db/schema.ts` +
one migration (`public_id` only).

Import is expected to be rare — mainly populating the app at setup from curated reports and
another database — so it favours correctness and clear review over speed.

**Public ID** (D8) — do this first; export and import both depend on it.

- [x] Add `incidents.public_id`: `char(5)`, `NOT NULL`, `UNIQUE`, lowercase.
- [x] **Alphabet: `23456789bcdfghjkmnpqrstvwxz`** — digits and consonants only, with
      look-alikes (`0 o 1 l i`) removed. The **first character is always a letter**. Why:
  - _No vowels_ → no accidental words, and no month names that Excel could read as a date.
  - _Letter first_ → Excel can't read it as a number. `12e45` would become `1.2E+46`, and
    `01234` would lose its leading zero. It also never starts with `-`, which would trip the
    formula-escaping below.
  - _Lowercase only_ → case can't matter when someone types or compares an ID.
- [x] Space: 19 × 27⁴ ≈ 10 M. Collisions stay unlikely at hundreds of detections a year, but
      they aren't impossible. The unique index is the guarantee; inserts **retry on a
      unique violation** (up to 5 times) rather than assuming the ID is fresh.
- [x] Generate it in Postgres, as the column `DEFAULT gen_public_id()` (a small plpgsql
      function in a custom migration). Adding a column with a volatile default fills every
      existing row, so no separate backfill script is needed, and no code path can insert a
      row without one. Keep the alphabet in one TS constant too, for validating imported IDs.
- [x] Show the public ID on feed cards (small, muted) and in the admin list, so a row in a
      spreadsheet can be matched to what's on screen.

**Format**

- [x] **One column spec** in `src/lib/csv/columns.ts`, used by export, template, and import.
      Columns: id, disease (slug), county_fips, state, county, observed_on, reported_on, crop,
      operation_type, strain, source, comments. On import, `id` is optional, and either
      `county_fips` or `state` + `county` is required.
- [x] **Download** `GET /detections.csv?disease=&year=` (and `year=all`), reusing
      `getDetections()`. Filename like `late-blight-2026.csv`. **Escape formula injection:**
      prefix any cell starting with `=`, `+`, `-`, `@`, tab or CR with `'` — growers open these
      in Excel and `comments` is free text. The import strips that prefix again.
- [x] **Template** at `/admin/import/template.csv` — header row plus one example row.

**Import flow** — `/admin/import`, under the existing admin guard.

- [x] Upload → server parses (`papaparse`) → validates every row through
      `src/lib/validation/incident.ts` → county resolution (D6) → matching → **review page**
      → confirm. Cap at ~~1 MB~~ **400 KB** / 2,000 rows server-side (adapter-node's default
      `BODY_SIZE_LIMIT` is 512 KB, and confirm posts the text again). Normalise crop/operation/strain exactly
      as the form does.
- [x] **Invalid rows block the import** — the review page lists each one by row number and
      reason. Nothing is written until the file is clean.
- [x] **Matching**, for each valid row:
  - `id` present → match the detection with that `public_id`. An unknown `id` is an error. If the date or county
    has changed, show the row as an edit to those key fields.
  - No `id` → match on disease + county + observed date.
- [x] **Each row is classified** as one of:
  - **New** → insert.
  - **Identical** (every field equal after normalisation) → skip. Counted, not listed.
  - **Conflict** (same key, other fields differ) → show existing vs new side by side, with
    differences highlighted, and a choice: **Keep existing** (skip) / **Keep new** (update
    the existing row in place) / **Keep both** (insert). Default: keep existing. Add
    "apply to all conflicts" buttons, since a setup import may have many.
  - **Several existing matches** (e.g. two crops confirmed in one county on one day) → only
    keep existing / keep both are offered. To replace a specific one, the file must carry its
    `id`.
  - **Matches a retracted (soft-deleted) detection** → flagged, default skip. Otherwise
    re-importing from an old database would quietly resurrect a retraction.
- [x] **Duplicates inside the file itself** are handled the same way: identical rows collapse
      with a note; differing rows become a conflict between the file's own rows.
- [x] **Carrying state between steps:** ~~an HMAC-signed payload~~ — changed in
      implementation: the confirm form posts the **original CSV text** back, and confirm
      re-parses and re-validates it from scratch. Tampering gains nothing (it meets the same
      validation as an upload), so signing would add a secret and no protection.
- [x] **On confirm, match everything again.** If any matched row's `updated_at` changed since
      the review, refuse and re-show the review. Never apply choices to data the admin didn't see.
- [x] `importIncidents(plan, actor)` in `queries/admin.ts`: one transaction for the whole file.
      One `audit_log` row per insert or update, with the file name recorded, so a bulk load can
      be traced and reviewed later.
- [x] Show a summary afterwards: _n_ added, _n_ updated, _n_ skipped as identical, _n_ kept
      as existing.
- [x] **Same duplicate check in the single-entry form:** creating a detection whose disease +
      county + date already exists shows a warning linking to the existing one, and a
      confirmation is required to save anyway. A warning, not a block — "keep both" is legitimate.

**Tests**

- [x] Unit: column spec, formula escaping round-trip, county resolution (FIPS, names,
      ambiguous, unmatched), and classification of every case above.
- [x] e2e: download → re-import is all "identical"; edit one row's crop → one conflict, and
      each of the three choices does what it says; a file with one bad row writes nothing.

**Acceptance:** a download re-imports as all-identical; no path creates a duplicate without
the admin explicitly choosing "keep both"; every write has an `audit_log` row.

Notes from implementation:

- **Admin guard moved into `hooks.server.ts`** (`guardAdmin`). The layout `load` guard never
  runs for form actions or `+server.ts` endpoints, so "one guard for /admin" wasn't true
  before. Tested: an anonymous same-origin POST to an admin action gets 401.
- **All mutations are now transactional** with their audit row. Previously a failed audit
  insert would have left an unaudited change.
- Public ID: two migrations (`0002` custom function, `0003` column), so drizzle-kit's
  snapshot stays accurate. The retry's error handling was verified against real Postgres:
  Drizzle wraps the error, and the cause carries `23505` + the constraint name.
- Row numbers are **spreadsheet rows**, not file lines (a multi-line comment is one row).
- 4-digit FIPS codes are left-padded, since Excel strips leading zeros. County names match
  case-insensitively, ignoring "County"/"Parish" and Saint/St./St spelling. Names that
  are genuinely ambiguous (Richmond, VA: county vs city) are errors naming both FIPS codes.
- The template's example row carries a sentinel comment, and the importer refuses it, so
  importing the template unedited can't create a detection.
- In-file duplicates offer "skip this row" / "keep both" only; "replace the earlier row" is
  done by editing the file.
- The public download link is in the feed header for now; 5C moves it into the control bar.
- Known gap: `counties.name` is Census NAME, not NAMELSAD, so "Baltimore city" and
  "Baltimore County" both normalise to "baltimore". Such rows need `county_fips`.

### Wave 2 — depends on Waves 0 and 1 (5C, then 5F)

#### Track 5C — Control panel and county labels — ✅ DONE

Owns `src/lib/components/shell/ControlPanel.svelte` (new), `src/lib/map/labels.ts` (new),
`src/lib/components/map/CountyLabels.svelte` (new), `src/routes/+page.svelte`, and a
mount point in `DetectionMap.svelte`.

**Panel**

- [x] A slim bar between the header and the map/feed. Always visible: a "Map tools" toggle
      (chevron), **Share** (from 5S), and **Download CSV**. Expanded, it slides open and pushes
      the page down, showing:
  - a "Label counties with detections" switch;
  - when the switch is on, the recency slider and the "Showing 10 of 14" note;
  - for admins, an "Import CSV" link to `/admin/import`.
- [x] Use Svelte's `slide` transition. Confirm MapLibre follows the container's height change
      (v6 watches its container with a ResizeObserver). If it doesn't, call `map.resize()`
      when the transition ends.

**Labels**

- [x] Slider: picks a start date, snapping to days. Range: Jan 1 of the selected year to
      today (current year) or to the last detection (past years). Beside it, show the date and
      how many days back it is: "Since Sep 15 · last 7 days". **Default when first turned on:
      the last 7 days**, to match a weekly newsletter.
- [x] `selectLabels(detections, since, max = MAX_LABELS)` in `labels.ts` — pure and
      unit-tested: filter by date, one per county, newest first, take `MAX_LABELS = 10`.
- [x] Label text: "Dane County, WI · Sep 3". Crop is a possible later addition.
- [x] **Placement for screenshots:** labels start at an offset that points away from nearby
      labels. A simple nudge pass in screen space removes overlaps. **Each label can be
      dragged** to fine-tune it before a screenshot, and its leader line follows. Drag
      offsets are kept per county until disease or year changes.
- [x] Leader lines are an SVG overlay over the map, redrawn on map `move` and on drag. Clicking
      a label selects its county, as a feed card does. The rest of the map stays clickable.
- [x] While labels are on, hide the hover tooltip, so the pointer doesn't end up in the
      screenshot.

**Acceptance:** never more than 10 labels; the slider updates labels without refetching; no
label overlaps another after placement at the default extent; labels, lines, and drag survive
pan and zoom; the Share link reproduces the labels.

Notes from implementation:

- Label state (`labelsSince`, null = off) lives in `ViewState`; Share adds `since=`, and
  `+page.server.ts` accepts it only as a real date inside the season shown. A disease/year
  switch keeps labels on but resets the window to that season's default.
- `placeLabels` tries eight directions, starting from "away from the group", and takes the
  first that fits inside the viewport without covering its own county point or an obstacle.
  Only then does it push overlaps apart. Without the candidate step, labels near an edge
  were clamped back onto their own county (caught by screenshot, now covered by a unit test).
- Obstacles are found by DOM query: anything marked `data-map-obstacle` (view buttons,
  legend) or `.maplibregl-ctrl`, within the `data-map-root` section.
- Labels re-place on `moveend`/`resize`; dragged ones never move. Arrow keys nudge a focused
  label (Shift for bigger steps); Enter selects its county.
- `CountyLabels` exposes `bind:layout` (anchor + box per label, in container pixels) for 5F.
- Share and Download CSV moved into the bar; the feed-header download link was removed.
- The labels switch is an `sr-only` checkbox with a styled track, so tests click the visible
  text (as a person would) rather than `.check()` the hidden input.

#### Track 5F — "Save map image" — ✅ DONE

Owns `src/lib/map/export-image.ts` (new) and the button in `ControlPanel.svelte`.

Screenshots of the page work too, but a built-in export gives newsletter images that are
consistent week to week, and it always carries the attribution that cropped screenshots lose.

- [x] **"Save image" button** in the slim control bar, next to Share and Download CSV. It
      downloads a PNG named like `late-blight-2026-09-22.png`.
- [x] **What you see is what you get.** The export uses the current map extent, theme,
      labels, and dragged label positions. A fixed-size offscreen render would give identical
      dimensions every week, but it would lose the label arrangement the user just made — and
      that arrangement is the whole point of the labels. Revisit only if the newsletter needs
      a fixed size.
- [x] **Resolution:** capture at 2× — temporarily `map.setPixelRatio(2)`, wait for `idle`,
      capture, restore — so the image stays sharp in print and on high-DPI screens.
- [x] **Capture timing:** read the WebGL canvas inside a `render` callback, or it comes back
      blank. Prefer that over `preserveDrawingBuffer: true`, which costs performance
      permanently for an occasional action.
- [x] **Composition** onto one 2D canvas: the map; leader lines and labels redrawn with the
      Canvas 2D API from 5C's label data (DOM is not rasterised); legend; a title band
      ("Late blight detections · 2026 · as of Sep 22, 2026"); a footer with
      "University of Wisconsin–Madison" and the **basemap attribution** (OpenStreetMap
      contributors / OpenFreeMap), which the OSM licence requires.
- [x] Leave out interaction chrome: the zoom buttons, floating controls, hover tooltip, and
      the selected-county outline (clear its filter during capture, then restore it).
- [x] Fonts: wait for `document.fonts.ready` before drawing text, or the canvas falls back to
      a default font.
- [x] A tip in the open panel (and the button's title) in dark mode: newsletters usually
      print on white, so switch to light mode first. Advice, not enforcement.
- [x] If the basemap failed to load, still export (counties only) and keep the attribution
      accurate: no OSM credit when no OSM tiles are shown.

**Acceptance:** the PNG matches the screen (labels in their dragged positions), is sharp at 2×,
includes title, legend, and attribution, and shows no controls or tooltip. Verify by opening
the file, not only by asserting a download happened.

Notes from implementation:

- `saveImage()` is a method on `DetectionMap` (the page calls it via `bind:this`); the
  drawing is `composeImage()` in `$lib/map/export-image.ts`, tested in Chromium on real
  pixels (`export-image.svelte.spec.ts`).
- **Attribution comes from the attribution control's rendered text**, not the style's
  sources. OpenFreeMap's credits load from TileJSON at runtime and never appear in the style;
  the first working export had no OpenStreetMap credit. Caught by looking at the PNG.
- The idle wait before capture is capped at 8 s, so a slow tile host can't hang the button.
- The footer shows the site host, so a newsletter reader can find the live map.
- Legend caption and "No detections reported" moved to `symbology.ts`, shared by the
  on-screen legend and the image.

### Wave 2½ — feed and admin polish (before 5E)

#### Track 5G — Feed windows, detail modal, admin edit modals, admin landing — ✅ DONE

Settled with the user 2026-09-23.

- **D12. Feed sections follow the legend on screen.** Current year: Within 7 days / 8–14
  days / 15–30 days / More than 30 days. Past years: the timing legend's month bins (May or
  earlier … October or later), by each detection's own observed month. Empty sections say so.
  One binning helper in `symbology.ts` serves the map colours and the feed.
- **D13. Admin editing happens in modals via SvelteKit shallow routing** (`preloadData` +
  `pushState`). `/admin/incidents/new` and `/admin/incidents/[id]` stay as real pages (direct
  links, no-JS), and their actions are what the modal posts to, so `guardAdmin` still covers
  every write. From the public map the modal is pushed with an empty URL, so the address stays
  `/`. Back closes the modal.
- **D14. `/admin` is the detection list.** The landing page only linked to it. The admin header
  shows the signed-in account; `/admin/incidents` redirects to `/admin`, keeping its query.

**Feed (public)**

- [x] `binToken` in `symbology.ts`, used by `tokenFor` and by `feedSections` (`$lib/feed/`).
      Unit-tested at 7/8, 14/15, 30/31 days and across the month folds.
- [x] Feed sections per D12, "No detections" in empty ones; newest first within a section.
      Headings carry the legend swatch and a count.
- [x] Card: short observed date beside the county name; comments clamped to two lines.
- [x] Card restructured so the select target and an **expand** button are siblings. Expand
      opens `DetectionDetail`: county, disease, observed/reported, crop/operation/strain,
      source, public ID, full comments. The ID moved off the card into this dialog.
- [x] `reportedOn` added to the public `Detection`.
- [x] Admins see **Edit** in the detail dialog → edit modal (D13); after a write
      `ViewState.refresh()` reloads the view, keeping the selection if it still has data.

**Admin**

- [x] `shadcn-svelte add dialog` (vendored; prettier-formatted, not hand-edited).
- [x] `IncidentDialog` hosts `IncidentForm` for add and edit, including retract/restore.
      The actions are unchanged (they still redirect); the modal treats a redirect as "done".
- [x] Unsaved changes = form values differ from the snapshot taken on open. Outside click,
      Escape, the close button, or Back with unsaved changes → "Discard changes?" bar.
- [x] `/admin` shows the list; header reads "Signed in as …"; `/admin/incidents` 308s to
      `/admin` with its query. Full-page actions redirect to `/admin`.
- [x] Filters: year select from `listIncidentYears()` (all diseases, retracted included);
      applies on change with `replaceState`; "Reset filters" when any differs from default.
      Apply button only in `<noscript>`. Filter inputs are `filter-*` ids — the modal form
      already uses `diseaseId`, and duplicate ids broke both labels and tests.
- [x] e2e: lifecycle via modal; direct edit page; dirty prompt (outside/Escape/Back, and
      undo-to-clean closes freely); refused save keeps values; filters + reset; old URL
      redirect; public expand → edit → feed updates; feed headings both modes. 64/64 green.

Notes from implementation:

- D13 changed slightly: modal entries use `pushState('')` on the admin list too, not the page
  URL. With the real URL, `invalidateAll()` after a save would run against the wrong route.
  Refresh therefore returns to the list, not to the open editor.
- The duplicate-warning link in the form opens in a new tab, so following it from the modal
  doesn't lose the entry in progress.
- A county can have cards in two sections (e.g. Dane: Sep 20 and Aug 26) while its map
  colour follows its newest detection. That is intended.

**Follow-ups (same day, from review):**

- [x] **Cancel** beside Save in the modal; same path as clicking outside (asks if dirty).
- [x] **Retract** button uses the light-red `destructive` variant.
- [x] **Reported on ≥ observed on**, enforced as the admin types: `reportedBeforeObserved()`
      in `validation/incident.ts` drives an inline error and a disabled Save, and `min` on the
      date input greys out earlier days. `parseIncident` (server and CSV import) uses the
      same function, so the rule is still enforced on the server.
- [x] **County picker** replaces the 3,100-option select: `CountyCombobox` (ARIA combobox,
      keyboard + pointer) over `searchCounties()` — word-prefix match on county, state name,
      or USPS; ignores "County"/"Parish"; St/St./Saint alike; accents ignored; exact FIPS
      works; 50 results max. Still constrained: a hidden input posts the FIPS, and the
      visible input is invalid (blocks submit) until a county is chosen. Needs JavaScript,
      unlike the old select; the admin area already relies on it for the modals.
- [x] **Recency ramp red → blue** (was red → yellow): red, rose, violet, pale blue. Lightness
      stays monotone, so the order reads without hue. Checked with the dataviz ordinal
      validator in both themes (monotone L, ≥ 0.06 steps, light end ≥ 2:1 on the surface).
      The pale end is darker than the old pale yellow (L 0.77 vs 0.89), to clear that floor.
- [x] Tests: search unit tests; e2e for picker (search, Escape keeps dialog, typed text
      can't submit), date lockout, Cancel. 135 unit / 67 e2e green.
- [x] **Light is the default theme**, regardless of the OS setting (reverses 5A's "initial
      theme from `prefers-color-scheme`"). A dark choice via the toggle is still remembered.
- [x] **"(3 days ago)"** after the date on feed cards and the detail modal's Observed row:
      `timeAgo()` in `$lib/feed/time-ago.ts` — days up to 30 (the legend's last day
      window), then whole calendar months, then years; never "0 months".
- [x] Fixed an e2e race: the admin lifecycle test created its detection in late blight 2026,
      which the parallel feed tests count exactly ("5 detections"). It now uses 2024.

**Acceptance:** feed sections always match the legend beside them; no admin write path bypasses
`guardAdmin`; a modal with unsaved changes never closes without confirmation; the public
address bar stays `/` throughout. ✅ Screenshot-checked light/dark (feed, detail, dirty prompt).

### Wave 3 — remaining polish from the original Phase 5

#### Track 5E — Accessibility, loading, and meta — ✅ DONE

- [x] Keyboard path: the feed reaches every selectable county. A polite live region in
      `+page.svelte` announces "Selected Dane, WI: 2 detections.", "Selection cleared.",
      and "Showing cucurbit downy mildew, 2026: 4 detections." Silent on arrival.
- [x] Ramps contrast-checked in both themes with the dataviz ordinal validator (monotone
      lightness, ≥ 0.06 per step, light end ≥ 2:1 on the surface). Recency passed after 5G.
      **Timing failed and was re-stepped**: in light mode October's pale yellow was 1.17:1
      against the no-data grey (now a gold at L 0.77, 2.1:1 on white); in dark mode the
      last two steps were 0.056 apart. Counties are opaque fills, so the dark basemap only
      matters around the edges.
- [x] Loading state: "Loading map…" (`role="status"`) over the map until the counties are
      drawn. The topology fetch now starts alongside the basemap style instead of after it.
      Root `+error.svelte`: 404 vs other errors, with a full-reload link back to the map.
- [x] Mobile pass at 360 px: title and year share a row ("Year" label is screen-reader-only
      below `sm`), disease tabs size to their names so both fit one line, and the legend
      folds into a swatch chip above the attribution. Map height went from ~50% to ~60% of
      the screen. No horizontal scroll.
- [x] Open Graph + `twitter:card` tags. Server-rendered from the arrival view, so a Share
      link previews its own disease/year ("3 confirmed late blight detections in 2025…").
      No `og:image` — a static image would misstate the data; a rendered one is a follow-up.
- [x] **Lighthouse accessibility (13.5, mobile emulation): 100** on `/`, `/about`, `/login`,
      and `/admin` (signed in). The first run gave `/` 96 (inactive disease tab 4.34:1) and
      `/about` and `/login` 98 (no `<main>` landmark); both fixed.
- [x] e2e (`a11y.e2e.ts`): announcements, loading state (topology held back), 404 page, OG
      tags, 360 px layout (no sideways scroll, folded legend, map ≥ 55% of the screen).

Notes:

- Lighthouse ran light mode only. Dark-mode contrast was checked by computation (tokens and
  validator), not by an audit run.
- At 360 px portrait the default extent is width-bound, so the US sits small with Canada
  above it. Acceptable; a portrait-specific extent is possible if it matters in practice.
- Fetching the topology earlier made `map.e2e.ts`'s response listener racy; it now
  listens before navigating.

### Phase 5 verification

- [x] `pnpm check` 0 errors, `pnpm lint` clean, `pnpm test:unit --run` (140) and
      `pnpm test:e2e` (73, twice in a row) green.
- [x] Screenshots in light and dark, desktop and mobile, basemap on and unset (no console
      errors with it unset).
- [x] Full admin loop: sign in from the new link → import a CSV (with one conflict) → detections
      appear → turn on labels, drag one, share the link, open it in a fresh browser → download
      matches → retract one → it leaves map, labels, and export. _Covered piecewise by
      e2e (import with conflict choices, labels + share round trip, retract leaves the
      map); not yet walked through by hand as one session._

---

## Phase 5½ — Accounts and attribution (before Phase 6)

#### Track 5H — Roles, invitations, account page, "Reported by" — ✅ DONE

Settled with the user 2026-09-23. The goal is trust and accountability among ~6–12 reporters:
every detection names who entered it, and accounts are managed in the app, not by a CLI.

- **D15. Two roles: `admin` and `reporter`.** Both can add, edit, and download detections.
  Only admins manage accounts and import CSVs. Stored as `user.role` via Better Auth `additionalFields` with
  `input: false` — otherwise the built-in `updateUser` endpoint would let a user set their own
  role. Better Auth's admin plugin is **not** used: its impersonation undermines attribution.
- **D16. Reporters edit, retract, and restore only their own detections.** Admins can act on
  any. Enforced in the mutations in `queries/admin.ts` (not only in the UI).
- **D17. "Reported by" is public**: display name and affiliation, on the public detail dialog,
  the admin list, and the CSV download (export-only column; import ignores it). It means
  _who entered it_ (`incidents.created_by`); the free-text `source` still records who
  diagnosed it. Imported rows read **"Imported by"** instead (`incidents.imported`, backfilled from
  `audit_log`), so back-loaded history doesn't look like a first-hand report. Rows with no creator show "—". Email addresses
  never appear outside `/admin/users`. The invite-acceptance page says the name is public.
- **D18. Invitations are copyable one-time links**, no email sending (no SMTP dependency; the
  deploy stays portable). Token stored hashed, expires in 7 days, single use. The invitee sets
  their own password, display name, and affiliation. Accounts are created through
  `auth.$context` (as `create-admin` does), so `disableSignUp` stays on. An admin can issue a
  **password reset link** by the same mechanism — the only "forgot password" path.
  `pnpm create-admin` stays for bootstrapping and lockout recovery (it creates admins).
- **D19. Deactivate, never delete, users.** `created_by` is `on delete set null`, so deleting
  a user would erase attribution. Deactivating revokes all sessions and blocks sign-in (with
  the same generic error as a wrong password). Nobody can demote or deactivate themselves,
  and the last active admin can't be demoted or deactivated.
- **D20. `/admin/users/**` and `/admin/import/**` are admin-only**, enforced in
  `guardAdmin` (pages, actions, endpoints). Reporters get no read-only view of either. Import
  exists to back-load historical detections, not for routine entry, and it can overwrite
  existing detections ("keep new"), so it stays with admins. `applyImport` also checks the
  role, so the rule holds if the route ever moves.

**Schema / auth**

- [x] `additionalFields` on `user`: `role` (text, default `reporter`, check constraint),
      `affiliation` (text, nullable), `deactivatedAt` (timestamp). `pnpm auth:schema`, then a
      migration that sets existing users to `admin`.
- [x] `invitations` table: `tokenHash`, `kind` (`invite` | `reset`), `email`, `role`, `userId`
      (for resets), `createdBy`, `expiresAt`, `usedAt`, `revokedAt`.
- [x] Sign-in refuses deactivated users (Better Auth `databaseHooks.session.create.before`),
      and `handleBetterAuth` drops a session whose user has been deactivated since.
- [x] `guardAdmin`: `/admin/users` and `/admin/import` require `role === 'admin'` (403 for
      reporters). The Import link and template download are hidden for reporters.
- [x] `create-admin` sets `role: 'admin'`; `MIN_PASSWORD_LENGTH` now imported from
      `$lib/validation/account.ts`, so there is nothing to keep in sync.

**Attribution**

- [x] `Actor` carries `role`; `updateIncident` / `retractIncident` / `restoreIncident` refuse
      when a reporter isn't the creator. `applyImport` refuses non-admins.
- [x] Edit / Retract hidden in the detail dialog and admin list when not permitted.
- [x] `reportedBy { name, affiliation }` on the public `Detection` (via `loadView`) and on
      admin rows; shown in `DetectionDetail` and a list column.
- [x] Admin list filter: "Reported by" select (users who have entered detections, plus
      "Mine"), in the query string like the other filters.
- [x] CSV download: `reported_by` column in `$lib/csv/columns.ts`, export-only.

**Users page (`/admin/users`, admins)**

- [x] Table: name, affiliation, email, role, detections (non-retracted), last sign-in,
      status (active / invited / deactivated).
- [x] Invite form (email, role) → shows the link once with a Copy button. Pending invites
      listed with Revoke.
- [x] Row actions: change role, deactivate / reactivate, issue reset link. Guards per D19.
- [x] Every account action writes an `audit_log` row (`table_name = 'user'` / `'invitations'`).

**Invitation / reset acceptance (`/invite/[token]`, public)**

- [x] Invalid, used, expired, and revoked tokens all show the same message.
- [x] Invite: display name, affiliation, password + confirm (min 12). Reset: password only.
      Signs the user in afterwards. (No extra rate limit: a 256-bit token can't be guessed.)

**Account page (`/admin/account`, everyone)**

- [x] Change password (Better Auth `changePassword`, current password required, revokes
      other sessions).
- [x] Edit display name and affiliation (server action, not `updateUser`, so `role` stays
      out of reach). Header "Signed in as …" shows the display name and links here.

**Tests**

- [x] Unit: permission checks per role, path rules, profile/password validation. The
      last-admin guard and token handling are database code, covered by e2e (single use,
      unknown link, self-guard). Expiry: `queries/users.spec.ts` (added 2026-09-24) runs
      against the dev database with a faked clock — invites work at 7 days less a second and
      are refused (page and form) a second after; reset links likewise at 2 days.
- [x] e2e: invite → accept → sign in as reporter; reporter can't reach `/admin/users` (page
      or action) or `/admin/import` (page or action); reporter edits own but not another's; reset
      link; change password; deactivated user can't sign in;
      "Reported by" in the public detail and CSV.
- [x] `seed:dev` creates a dev reporter alongside the dev admin; README lists both.

**Acceptance:** no account-management write is reachable by a reporter; no reporter can
change a detection they didn't enter or reach import; every detection shows who
entered it without exposing an email address; the CLI is no longer needed to add a user.
✅ 85/85 e2e twice in a row; screenshot-checked desktop light, 390 px dark, invite page.

Notes from implementation:

- Reset links last **2 days** (invites 7): a reset takes over an account that already has
  detections. A new link for the same address or account revokes the previous one.
- Accepting an invite and using a reset link sign the user in via `auth.api.signInEmail`;
  resetting also ends every existing session for that account.
- `lastSignInAt` is written by a `session.create.after` hook — sessions are deleted on
  sign-out and expiry, so they can't answer "last signed in".
- `/update-user` and `/change-password` are in Better Auth's `disabledPaths` (HTTP only):
  otherwise both were unaudited routes to profile/password changes. e2e checks a reporter's
  `update-user` with `role: 'admin'` gets a 404.
- Fixture detections are now attributed: 3 to the dev reporter, the rest to the dev admin,
  last season's late blight marked imported. The e2e suite signs each seeded account in
  once (`e2e/auth.setup.ts`, a Playwright setup project) and reuses the session.
- Fixed in passing: `/admin` scrolled sideways at phone width (508 px on a 390 px screen).
  The `sr-only` "Actions" header is absolutely positioned and escaped its scroll container;
  the containers are now `relative`.
- The user/invitations `CHECK` constraints are hand-written at the end of
  `drizzle/0004_accounts.sql` (Better Auth owns the user table's schema file). drizzle-kit
  doesn't know them, so it won't recreate them — keep them in mind if the table is rebuilt.

**5H follow-up (2026-09-24), settled with the user:**

- **D21. Admin seniority.** An admin can change another admin's account — role, email,
  reset link, deactivation, reactivation — only if they became an admin first
  (`user.admin_since`, set on promotion and cleared on demotion). Someone you promote can
  never demote or lock you out. Removing the most senior admin is done with
  `pnpm create-admin --deactivate`; the app keeps at least one active admin either way.
- [x] `admin_since` column (migration 0005 backfills from `created_at`; check constraint ties
      it to `role`). `canManageUser` in `roles.ts` (unit-tested); `managed()` locks both rows
      and applies it in every account action.
- [x] Users page: **Change role** and **Change email** open a dialog (role options say what
      each allows; email says they'll be signed out), **Reset password** replaces "Reset
      link", the issued-link panel has a dismiss button. Rows sort active admins (most senior
      first), then reporters, then deactivated. New columns: admin since, **Added by**
      (inviter). Senior admins' rows read "Admin before you", with no actions.
- [x] Email changes are admin-only: unique, not a pending invitation, sessions ended, unused
      reset links revoked, audited. Reporters ask an admin.
- [x] e2e: dialog promote → junior admin sees no actions on the founder and every direct
      POST is refused → founder demotes them; email change (taken address refused in the
      dialog; old session ends; sign in with the new one); dismiss; admins-first order.

**Polish (2026-09-24), from the user:**

- **D22. County labels are on by default**, over the last **14 days** (was off, 7 days).
  Share links now say `labels=off` when they're off, since on is the default. Revises D1–D2.
  Consequence: hover/tap tooltips now show while labelling (they used to be suppressed so
  they wouldn't land in screenshots; "Save image" draws from data and never includes one).
- [x] "Import CSV" removed from the map tools panel (it's in the admin header).
- [x] The top bar's link reads "Account" for reporters, "Administration" for admins.
- [x] Admin header: "← Back to map" at the far left, replacing "View public map".
- [x] **Fixed a real bug this exposed:** labels on + arriving on a county (share link)
      looped forever (`effect_update_depth_exceeded`), leaving the map never settled.
      `easeTo` interrupting the arrival animation fires `moveend` synchronously inside the
      fly effect, and the labels' `frame++` read `frame` there and subscribed the effect.
      Both ends are now `untrack`ed. Previously reachable only via a link carrying both
      `since` and `county`.
- [x] Test races fixed: the label-drag and "Save image" tests measured while the tools panel
      was still sliding open; the unsaved-changes test clicked outside a modal before it was
      ready. 88/88 e2e three runs in a row.

**Follow-ups found during 5H (done 2026-09-24):**

- [x] **The sign-in form is not rate-limited.** `/login` calls `auth.api.signInEmail`
      server-side, and Better Auth only rate-limits HTTP requests to its own handler —
      probed: 7 wrong passwords in a row via `/login` were all answered, none refused. The
      "Too many attempts" branch in the login action is unreachable. Needs a limiter in
      the action itself (keyed on `event.getClientAddress()` and the address), or the form
      posting to the handler. **Fixed:** `$lib/server/rate-limit.ts`, in memory (one
      process). Only failures count: 5 per address per client in 5 minutes, 20 per client
      across addresses in 15. Nothing keyed on the address alone, so nobody can lock a
      specialist out by typing their email. A blocked attempt never reaches the hasher.
- [x] **Better Auth's own limiter shares one bucket across all clients** behind adapter-node:
      it can't find a client IP ("falling back to a single shared per-path bucket"). Set
      `advanced.ipAddress.ipAddressHeaders` to the reverse proxy's header in Phase 6.
      **Fixed without waiting for Phase 6:** `authHeaders(event)` in `auth.ts` stamps
      SvelteKit's `getClientAddress()` into a private header, the only one Better Auth
      reads. `hooks.server.ts` calls `auth.handler` itself (in place of `svelteKitHandler`)
      to add it, and the `auth.api` calls that start sessions pass it too. So the one proxy
      setting is adapter-node's `ADDRESS_HEADER` / `XFF_DEPTH`; a client-sent copy of the
      header is overwritten.
- [x] Found in passing: **`/login?redirectTo=//other.site` was an open redirect** (the
      check was `startsWith('/')`, and `load` didn't check at all). Now only same-site paths.
- [x] Found in passing: **e2e never reached Better Auth's HTTP handler.** The preview
      server ran with `.env`'s `ORIGIN` (port 5173), so `/api/auth/*` fell through to
      SvelteKit's 404 — the "`update-user` is closed" test passed for the wrong reason.
      `playwright.config.ts` now sets `ORIGIN` for the preview server, and that test
      asserts the 404 isn't a SvelteKit page.
- [x] Invite/reset link **expiry** is now tested (see Tests). This is the first unit test
      that needs the database: `pnpm test:unit` now requires `DATABASE_URL`, as e2e does.
      It creates its own users and removes them, so it doesn't disturb the seed.

---

## Phase 6 — Deploy

### Staging (2026-09-24)

`blightmap.dev.agweather.cals.wisc.edu` on `deploy@dev.agweather.cals.wisc.edu -p 216`
(Ubuntu 24.04, 3.8 GB RAM shared with Rails apps, nginx + Passenger, certbot, Postgres
18.6, Node 24.21 via `n`, pnpm 9.9 global). Runbook: `deploy/README.md`.

- **D23. Build locally, ship the release.** The server has ~2 GB free, so it installs
  packages but never runs `vite build`. A release is `git archive HEAD` plus `build/`,
  in `releases/<UTC timestamp>`; `current` symlink; 5 kept; `deploy.sh rollback`. The
  script refuses a dirty tree, so a release is exactly one commit (`REVISION` file).
- **D24. systemd user service + nginx `proxy_pass`, not Passenger.** Restarts need no
  sudo (after a one-time `enable-linger`), it's the plain shape any host can run, and one
  process keeps the in-memory sign-in limiter exact. `ADDRESS_HEADER=X-Real-IP`, set by
  nginx. pnpm pinned via `packageManager` (10.15) and run with `npx` on the server.
- [x] `/health` (200 when the database answers, else 503); the deploy waits on it and
      switches back to the previous release if it fails.
- [x] `deploy/`: `deploy.sh`, `blightmap.service`, `nginx-blightmap.conf`,
      `env.staging.example`, `README.md`.
- [ ] One-time setup (user, needs sudo/DNS): DNS A record, database + role, linger,
      nginx + certbot, `shared/.env`.
- [ ] First deploy, `create-admin`, smoke test (sign in, invite, rate limit sees real
      client addresses, `X-Real-IP` from a client is overwritten).
- [ ] Data for stakeholders: real detections by CSV import, or synthetic (open).
- Later, for production: backups (`pg_dump` + destination), uptime monitor on `/health`.

---

## Phase 7 — Detections table

### Track 7A — Public `/detections` table, shared nav (2026-09-25) — ✅ DONE

- **D25. One detection list, public.** The old `/admin` list becomes `/detections`, open to
  everyone. Signed-in viewers also get Add/Edit (the same `IncidentEditor` modal),
  "Show retracted", and "Reported by". That filter's option values are user IDs, so only
  signed-in viewers receive it. `/admin` redirects, mapping `diseaseId` → `disease` (slug)
  and `includeDeleted` → `retracted`.
- **D26. Sorting and paging in the browser.** Filters (disease, year, and for signed-in
  viewers reporter and retracted) stay server-side in the query string. The table sorts
  and pages whatever the filters return. A season is hundreds of rows; if it ever reaches
  tens of thousands, move paging to the server.
- **D27. One header everywhere.** `AppHeader`: title · Map | Detections | Account | Users |
  Import CSV (tabs shown by role). The map passes its disease tabs and year picker in as
  `controls`. On phones the map header drops the title to stay two rows. The brand bar
  keeps Sign in/out and now says "Signed in as Name (Role)"; the "Administration" link
  is gone. The map's phone toggle reads "Map | List" so it doesn't collide with the
  Detections tab.
- [x] `shadcn-svelte@1.1.1 add table data-table` (`@tanstack/table-core`); generic
      `DataTable.svelte` with sortable headers, `aria-sort`, pager, rows per page.
- [x] `listDetectionRows` / `listDetectionYears` in `queries/detections.ts`, sharing one
      select with `getDetections`. `listIncidents` / `listIncidentYears` removed.
- [x] Columns: ID, Observed, County (links to the map's share URL), Disease, Crop,
      Operation, Strain, Reported by, Details (the map's `DetectionDetail` dialog) / Edit.
- [x] Download CSV follows the table's disease/year filters; `/detections.csv` accepts
      `disease=all`.
- [x] Sign-in, invite, reset, and incident-page redirects land on `/detections`.
- [x] The map strips share params on any arrival, not only a first load (the table's
      county links arrive by client-side navigation).
- [x] Tests: `DataTable.svelte.spec.ts` (paging, sorting, page size), `e2e/detections.e2e.ts`
      (public vs signed-in, sort, download link, map link), retracted rows hidden from a
      visitor asking `?retracted=1`, `/admin` filter mapping. Existing e2e updated.
- [x] Search box: filters the loaded rows as you type, with no reload and nothing in
      the URL. Every word must appear somewhere in the row (ID, dates, county, disease,
      crop, operation, strain, source, comments, reporter), ignoring case and accents
      (`$lib/search/text.ts`). `DataTable` takes `search` + `searchText`, so any table
      can have one.
- Not wanted: paging or sort state in the URL (user's call, 2026-09-25).
- [x] State column after County (full state name), sortable, searchable, and a State
      filter (server-side `state=WI`, like disease and year; options are states with
      detections). `/detections.csv` takes `state` too, and the download follows it.
- [x] County column and the detail dialog use the full county name. Migration 0007 adds
      `counties.full_name` (NAMELSAD), backfilled with the bare name until `pnpm seed`
      loads the real one. Every deploy seeds right after migrating.
- [x] Detail dialog is headed by the disease name; "Location: Dane County, Wisconsin"
      is the first row of its list.

---

## Session log

Append one line per working session: date, what moved, what's next.

- 2026-09-22 — Recovered the original plan from `~/.claude/plans/`; wrote this file with the
  Phase 5 polish plan. Next: resolve D1–D10, then start Wave 1.
- 2026-09-22 — Settled D1–D10 with the user. Added Wave 0 (URL state → Share links), duplicate-
  safe CSV import with conflict resolution, draggable labels for newsletter screenshots.
  Next: start Track 5S.
- 2026-09-22 — D8: internal integer key + public 5-char `public_id` (Excel-safe alphabet).
  D11: built-in PNG export adopted as Track 5F. All decisions settled. Next: Track 5S.
- 2026-09-22 — Track 5S done: view state out of the URL, `/api/view`, Share button, CLAUDE.md
  rule rewritten, fly-to replay bug fixed. check/lint/unit/e2e all green; screenshot-verified.
  Next: Wave 1 (5A, 5B, 5D — parallelisable).
- 2026-09-22 — 5A and 5B done: brand bar, theme toggle + no-flash script, sign-in link, map
  view buttons, detections-only selection, tooltips, live theme rebuild, dark basemap, full
  county names in the topology. 65 unit / 38 e2e green; screenshot-verified light/dark with
  and without basemap. Next: 5D (public ID, CSV export/import).
- 2026-09-22 — 5D done: public IDs, CSV download, duplicate-safe import with review and
  conflict choices, same-day warning on the single-entry form. Also: admin guard in hooks
  (covers actions/endpoints), transactional mutations. 103 unit / 49 e2e green.
  Next: Wave 2 — 5C (control panel + county labels), then 5F (save map image).
- 2026-09-23 — README now lists the dev admin login. 5C done: accordion control bar, label
  switch and date slider, draggable auto-placed labels, labels in share links. 118 unit /
  55 e2e green; screenshot-verified light/dark and zoomed. Next: 5F (save map image).
- 2026-09-23 — 5F done: Save image exports a 2× PNG with title, legend, labels as arranged,
  UW footer, and basemap credit. 123 unit / 56 e2e green; exports checked by eye in both
  themes. Next: Wave 3 — 5E (accessibility, loading/error states, mobile pass, OG tags).
- 2026-09-23 — 5G done: feed sections follow the legend, card dates, detail dialog, admin
  add/edit/retract in a modal (from the list and from the public map), `/admin` is the list,
  instant year/disease filters with reset. 126 unit / 64 e2e green. Next: 5E.
- 2026-09-23 — 5G follow-ups: modal Cancel, red Retract, reported-date lockout, searchable
  county picker, red→blue recency ramp, light-by-default theme, "time ago" on dates.
  140 unit / 67 e2e green. Next: 5E.
- 2026-09-23 — 5E done: live-region announcements, timing ramp re-stepped after the
  contrast check, map loading state, root error page, 360 px layout, OG tags. Lighthouse
  a11y 100 on /, /about, /login, /admin. 140 unit / 73 e2e green. Next: a manual
  end-to-end admin pass, then Phase 6 (still blocked on server details).
- 2026-09-23 — Planned Track 5H (D15–D20): admin/reporter roles, reporters edit only their
  own detections, in-app invite and reset links, account page, public "Reported by".
  Import is admin-only (back-loading, not routine entry). Next: implement 5H.
- 2026-09-23 — 5H done: admin/reporter roles, reporters edit only their own, in-app invite and
  reset links, account page (password + profile), users page with detection counts and
  deactivation, public "Reported by"/"Imported by" (detail, admin list + filter, CSV). Found:
  the `/login` form has no effective rate limit. 153 unit / 85 e2e green. Next: fix sign-in
  rate limiting, then Phase 6.
- 2026-09-24 — D21 admin seniority; role/email changes through dialogs; "Reset password";
  dismissible link panel; admins sorted first with "admin since" and "added by";
  `create-admin --deactivate/--reactivate`. Next: sign-in rate limiting, then Phase 6.
- 2026-09-24 — D22 labels on by default (14 days); map-tools Import link removed; "Account"
  for reporters; "Back to map". Fixed the labels + share-link effect loop and three e2e
  races. Next: sign-in rate limiting, then Phase 6.
- 2026-09-24 — 5H follow-ups done: `/login` failure limiter (per address+client, per
  client); Better Auth now sees the real client address via `authHeaders`; fixed an open
  redirect in `redirectTo`; e2e now actually reaches `/api/auth/*`. 162 unit / 91 e2e
  green. Next: Phase 6 (set `ADDRESS_HEADER` there).
- 2026-09-24 — Link expiry tested (fake clock against the dev database; checked it fails
  with the expiry test removed). 165 unit green. Next: Phase 6.
- 2026-09-24 — Phase 6 staging: surveyed the AgWeather dev server; `/health`, deploy
  script with rollback, systemd user unit, nginx site, runbook. Next: one-time server
  setup (DNS, database, linger, certbot), first deploy.
- 2026-09-24 — Admins can permanently delete a retracted detection (entered in error): a Delete
  button beside Restore, a confirmation dialog, `deleteIncident` (admin-only, retracted-only,
  audited with the full row). e2e covers it.
- 2026-09-24 — `seed:dev` dated rows in UTC, so evenings in the Americas every relative date
  was a day short and `feed.e2e.ts` failed; it now uses the app's local `today()`. Quieted
  `pnpm test`: e2e server output goes to `e2e/.server.log`, Chromium-only install, pnpm
  throughout. Full suite green.
- 2026-09-24 — "Reported on" is required: a new detection defaults to today; a CSV row with a
  blank `reported_on` takes `observed_on`. Migration 0006 backfills existing rows the same way
  (one `backfill-reported-on` audit row each) and makes the column NOT NULL (`deploy.sh`
  applies it on the next staging deploy).
- 2026-09-25 — Track 7A: public `/detections` table (shadcn DataTable, client-side sort and
  paging), shared `AppHeader` nav on every page, `/admin` → `/detections`. check/lint clean;
  unit and e2e green; screenshot-checked at 390/768/1024/1280. Not yet committed.
- 2026-09-25 — Committed 7A (`ee67786`). Added the table search box (client-side, instant).
- 2026-09-25 — Table: State column and filter (CSV follows), full county names
  (`counties.full_name`, migration 0007). Detail dialog headed by disease, with Location row.
