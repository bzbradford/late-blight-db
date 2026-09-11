# Vegetable Disease Detection Map

A public, county-resolution map of confirmed **late blight** (_Phytophthora infestans_) and
**cucurbit downy mildew** (_Pseudoperonospora cubensis_) detections in commercial vegetable
production.

Both diseases arrive by long-distance inoculum dispersal rather than persisting locally, so
knowing where and how recently they have been confirmed is the most actionable input a grower
or extension agent has for timing preventive fungicide programs.

The public site is read-only. Extension specialists hold admin accounts and enter detections.

## Stack

SvelteKit 2 / Svelte 5 (runes), TypeScript, Tailwind 4, shadcn-svelte, MapLibre GL JS,
PostgreSQL 18 with Drizzle ORM, Better Auth, `adapter-node`.

County geometry is a static build-time TopoJSON asset, not database geometry — there is no
PostGIS dependency. Scope is the continental US (lower 48 plus DC). See
[CLAUDE.md](CLAUDE.md) for the architecture decisions.

## Setup

Requires Node 24+, pnpm 10+, and a PostgreSQL 18 database.

```sh
pnpm install
cp .env.example .env    # then fill in DATABASE_URL and BETTER_AUTH_SECRET
pnpm db:migrate
pnpm build:geo    # Census shapefiles -> static/geo + scripts/data/counties.csv
pnpm seed         # reference data: diseases + counties (idempotent, production-safe)
pnpm seed:dev     # synthetic detections for local development only
pnpm dev
```

### Database role

The app connects over TCP with its own least-privilege role rather than your personal
Postgres role. To create it:

```sh
sudo -u postgres psql -c "CREATE ROLE lateblight_app LOGIN PASSWORD 'choose-a-password';"
psql -d lateblight_dev -c "GRANT CONNECT, CREATE ON DATABASE lateblight_dev TO lateblight_app;"
psql -d lateblight_dev -c "GRANT USAGE, CREATE ON SCHEMA public TO lateblight_app;"
```

`CREATE` on the _database_ (not just the schema) is required: drizzle-kit keeps its migration
ledger in a separate `drizzle` schema and must be able to create it.

### Browser tests

The Vitest `client` project and the Playwright e2e suite run a real Chromium. Install the
browser and its system libraries once:

```sh
pnpm exec playwright install chromium
sudo pnpm exec playwright install-deps chromium
```

Without the system libraries Chromium fails to start (`libnspr4.so: cannot open shared object
file`). The `server` test project needs none of this and runs anywhere:

```sh
pnpm exec vitest --run --project=server
```

## Commands

```sh
pnpm dev          # dev server
pnpm build        # production build
pnpm check        # svelte-check typecheck
pnpm lint         # prettier --check && eslint
pnpm format       # prettier --write
pnpm test:unit    # Vitest (client + server)
pnpm test:e2e     # Playwright
pnpm db:generate  # generate a migration from schema changes
pnpm db:migrate   # apply migrations
pnpm db:studio    # Drizzle Studio
pnpm build:geo    # regenerate map geometry from the Census shapefiles
pnpm seed         # seed diseases + counties
pnpm seed:dev     # replace incidents with synthetic dev data
pnpm auth:schema  # regenerate the Better Auth Drizzle schema
```
