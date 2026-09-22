# Late Blight / Cucurbit Downy Mildew Detection Map — Claude guidance

## Project overview

A public, county-resolution map of confirmed late blight (_Phytophthora infestans_) and
cucurbit downy mildew (_Pseudoperonospora cubensis_) detections in commercial vegetable
production. Both diseases arrive by long-distance inoculum dispersal rather than persisting
locally, so _where_ and _how recently_ they have been confirmed is what drives a grower's
preventive fungicide timing.

The public site is read-only. A small set of extension specialists hold admin accounts and
enter detections. The main view is a US county choropleth beside a detection feed; selecting
a county highlights its detections in the feed and vice versa.

**Work plan and progress live in `plan.md`.** Read it at the start of a session and update its
checkboxes and session log as work lands.

## Commands

```bash
pnpm dev          # Vite dev server
pnpm build        # Production build (adapter-node)
pnpm check        # svelte-check typecheck — must be 0 errors
pnpm lint         # prettier --check && eslint
pnpm format       # prettier --write
pnpm test:unit    # Vitest (client + server projects)
pnpm test:e2e     # Playwright
pnpm db:generate  # Generate a migration from schema changes
pnpm db:migrate   # Apply migrations
pnpm db:studio    # Drizzle Studio
pnpm build:geo    # Census shapefiles -> static/geo TopoJSON + counties.csv
pnpm seed         # reference data (diseases, counties) - idempotent
pnpm seed:dev     # synthetic detections + dev admin; truncates incidents, dev only
pnpm create-admin # provision or reset an admin account
```

## Architecture decisions

**Continental US only.** Alaska, Hawaii, and the territories are excluded from the
shapefiles and the county table — no reports are accepted for them, so carrying their
geometry would only add clickable counties that can never hold data. The filter lives in
`scripts/build-geo.ts`; `pnpm seed` removes any county rows that fall out of scope, unless
an incident still references them.

**The map extent is a minimum, not a clamp.** `PUBLIC_MAP_DEFAULT_EXTENT` picks a named
extent from `src/lib/map/extent.ts` (`conus` by default, `upper-midwest` for a regional
deployment). If the selected disease-year has detections outside it, the view widens to
include them — a detection must never sit off-screen because the default was framed tighter
than the data.

**Colours must be resolved before they reach MapLibre.** The palette is authored in
`oklch()`, which MapLibre cannot parse, and it cannot read CSS variables either. Always go
through `resolveToken()` in `$lib/map/symbology`, which rasterises via a 1×1 canvas. This
matters more than it looks: an unparseable colour does **not** throw — `addLayer` reports it
on the map's `error` event and silently skips the layer, leaving a basemap with no data on
it. Never swallow MapLibre `error` events.

**No PostGIS, and no geometry in the database.** Detections are county-resolution, keyed by
5-digit FIPS. There is no spatial predicate anywhere in the app. County geometry is a static
build-time TopoJSON asset under `static/geo/`; the server returns only detection rows, and the
choropleth is a client-side join on FIPS via `map.setFeatureState()`. Never re-serialize
GeoJSON to recolor the map, and do not add a spatial extension.

**The URL is the state.** Disease, year, and selected county live in query params
(`?disease=late-blight&year=2026&county=55025`) so every view is shareable — extension agents
email these links. Data fetching belongs in `load` functions driven by those params, not in
component-local fetches.

**Diseases are rows, not an enum.** Adding a third disease must be a data change, not a
migration plus a code sweep.

**Crop, operation type, and strain are free text.** No lookup tables, no enums, no foreign
keys, no validation beyond length. These fields are descriptive only — nothing in the map's
symbology or filtering reads them, which is what makes variant spellings cheap. Admins are a
small set of trusted extension specialists and the vocabularies are genuinely fuzzy
("Cucurbits" vs "Cucumber"). Normalize on input instead: trim, collapse internal whitespace,
capitalize the first letter only. Sentence case, never title case — title-casing mangles real
crop names. The admin form offers a `datalist` of distinct existing values so spellings
converge naturally, but anything typed is accepted.

**Everything recorded is public.** There are no admin-only or private fields. Detections
display at county resolution and carry no farm-identifying data; anything further worth
sharing goes in `comments`.

**Recency symbology differs by year.** For the current season, color by days since the most
recent detection. For a past season that ramp is meaningless — every detection is equally old
— so color by _first_ detection date instead, binned by month. Both read from the same
per-county aggregate (`first_detection`, `last_detection`, `count`).

**The basemap is optional context.** All basemap config lives in one module driven by
`PUBLIC_BASEMAP_STYLE_URL`. The app must render correctly with that variable unset — counties
and state outlines carry all the information.

**Portable deploy.** `adapter-node`, all config via environment variables, no platform-specific
APIs. It runs behind whatever reverse proxy the extension server provides.

## Conventions

- **Svelte 5 runes only.** `$state`, `$derived`, `$props`, `$effect`. Runes mode is forced
  project-wide in `vite.config.ts`. Do not use `$:`, `export let`, or legacy stores.
- **TypeScript strict.** No `any` — use `unknown` plus narrowing. No `@ts-ignore`; fix the type.
- **Shared reactive state** goes in `.svelte.ts` modules, not stores.
- **No `console.log`** in committed components.
- `pnpm check` and `pnpm lint` must both pass clean before a change is considered done.

## Key paths

- `src/lib/server/db/schema.ts` — Drizzle schema; single source of truth for the data model
- `src/lib/server/auth.ts` — Better Auth config. `disableSignUp` stays on.
- `src/routes/admin/+layout.server.ts` — the single guard for the whole admin area. Put new
  admin pages under `/admin` so they inherit it rather than carrying their own check.
- `scripts/create-admin.ts` — the only way an account is created. It uses Better Auth's
  server context (`auth.$context`) rather than the sign-up endpoint, so it works with
  `disableSignUp` on. It cannot import `src/lib/server/auth.ts`, which depends on
  SvelteKit-only modules, so it builds its own instance — keep `MIN_PASSWORD_LENGTH` in
  sync with the app config.
- `src/lib/components/ui/**` — vendored shadcn-svelte primitives, regenerated by
  `shadcn-svelte add`. Do not hand-edit; lint rules are scoped off for this directory in
  `eslint.config.js`.
- `src/lib/validation/incident.ts` — validation shared by the form and the server action
- `src/lib/server/queries/admin.ts` — admin reads and all four mutations; every mutation
  writes an `audit_log` row, so add new ones there rather than calling `db` from a route
- `static/geo/**` — generated TopoJSON; never hand-edit. Regenerate with `pnpm build:geo`.
- `scripts/build-geo.ts` — the only thing that writes `static/geo/` and `scripts/data/counties.csv`
- `scripts/seed.ts` — reference data, safe in production; `scripts/seed-dev.ts` truncates incidents

## What to avoid

- Do not add PostGIS or store geometry in Postgres.
- Do not hand-edit anything in `static/geo/` or `src/lib/components/ui/`.
- Do not enable public signup — admins are provisioned by CLI script.
- Do not report distinguishable sign-in errors. "No such account" and "wrong password" must
  read identically to the client, or the form confirms which addresses have admin accounts.
- Do not make sign-out reachable by GET.
- Do not hardcode the year list; derive available years from the data.
- Do not add lookup tables, enums, or constraints for crop, operation type, or strain.
- Do not add private or admin-only fields to incidents.
- Do not pass a raw CSS variable or `oklch()` value to a MapLibre paint property.
- Do not add counties outside the continental US.
- Do not let the county field accept free text. Everything on the map keys on FIPS, so that
  one input stays a constrained select while crop/operation/strain stay unconstrained.
- Do not mutate incidents without writing an `audit_log` row.
- Do not rely on client-side validation. `max` on a date input is a hint; the server action
  re-validates everything, including that the county actually exists.
- Do not hard-delete detections — they are soft-deleted so retractions stay auditable.
