# Vegetable Disease Detection Map

A public, county-resolution map of confirmed **late blight** (_Phytophthora infestans_) and
**cucurbit downy mildew** (_Pseudoperonospora cubensis_) detections in commercial vegetable
production.

Both diseases arrive by long-distance inoculum dispersal rather than persisting locally, so
knowing where and how recently they have been confirmed is the most actionable input a grower
or extension agent has for timing preventive fungicide programs.

The public site is read-only. Extension specialists hold accounts and enter detections, and
every detection shows publicly who reported it.

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

### Accounts

There is no public registration. There are two roles:

- **Reporters** add detections and edit or retract the ones they entered.
- **Admins** can also change anyone's detections, import CSVs, and manage accounts.

Admins invite people from **Users** (`/admin/users`): enter an address and a role, and copy
the one-time link it gives you into an email of your own — the site doesn't send email. The
recipient chooses their password, display name, and affiliation. The same page issues
password resets, changes roles and email addresses, and deactivates accounts (they are never
deleted, so their detections keep their name). Admins rank by when they became admins: you
can change another admin's account only if you became an admin first, so someone you promote
can't demote you. Everyone can change their own password and profile from
the name in the admin header.

The first admin of a new deployment comes from the command line:

```sh
pnpm create-admin --email jane@wisc.edu --name "Jane Doe"
```

A password is generated and printed once. Supply your own with `--password`, or rotate an
existing account's password with `--reset` (for recovering a locked-out admin). Nobody in
the app can deactivate the most senior admin; if they leave, use
`pnpm create-admin --email … --deactivate`.

**Development logins.** `pnpm seed:dev` provisions two fixed accounts, which the end-to-end
suite also signs in as. Sign in at `/login` (or the **Sign in** link in the top bar):

| Role     | Email                      | Password                |
| -------- | -------------------------- | ----------------------- |
| Admin    | `e2e-admin@example.com`    | `e2e-test-password-123` |
| Reporter | `e2e-reporter@example.com` | `e2e-test-password-456` |

These credentials are public — they are committed in `scripts/seed-dev.ts` — which is why
that script refuses to run under `NODE_ENV=production`, so the accounts can never exist in a
real deployment. Note that `pnpm test:e2e` re-runs `seed:dev`, which resets detections to
the synthetic fixture, clears invitations, and removes accounts the suite invited.

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
pnpm create-admin # provision or reset an admin account
```
