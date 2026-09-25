# Vercel + Supabase deploy

An alternative to the AgWeather staging server (`README.md`), for development and
stakeholder feedback. The app runs as serverless functions on Vercel, and the database is a
Supabase Postgres project. Nothing in the app depends on either: `vite.config.ts` chooses
`adapter-vercel` only when Vercel's build sets `VERCEL=1`, and everywhere else it's the same
`adapter-node` build as before.

What's different from the server deploy:

- **Sign-in limits are in Postgres** (`sign_in_failures`, and Better Auth's `rate_limit`),
  because serverless instances don't share memory. That's true on every host now.
- **The database connection goes through a pooler.** Each function instance opens its own
  connections, and Supabase's transaction pooler shares a few real ones among them. The
  client is created with `prepare: false`, which that pooler requires.
- **Migrations run in the production build** (`deploy/vercel-build.sh`), before the new
  deployment goes live. As on the server, the old deployment keeps serving while they run,
  so keep migrations additive.
- **Vercel supplies the client address**, so `ADDRESS_HEADER` and `XFF_DEPTH` aren't set.

The Supabase and Vercel dashboards change their layouts often. If a setting isn't where
this says, search the dashboard for it by name.

## One-time setup

### 1. Supabase project

1. Create a project in **East US (North Virginia), `us-east-1`**. The functions run in
   Vercel's `iad1` (`vite.config.ts`), in the same area. Each page runs several queries,
   so an app and database on opposite coasts would feel slow.
2. Choose a database password with only letters and digits, because it goes into a URL.
3. **Turn off the Data API** (Project Settings → Data API, or Integrations → Data API).
   Supabase serves every table in the `public` schema over REST, gated only by Row Level
   Security. The app doesn't use that API, and its tables (including `user`, `session` and
   `account`) don't enable Row Level Security. Do this before any real account exists.
4. Don't enable PostGIS or other extensions. The migrations create everything the app
   needs.
5. Under **Connect**, copy two connection strings, with your password filled in:
   - **Transaction pooler** (port 6543) → `DATABASE_URL`, used by the app.
   - **Session pooler** (port 5432 on the `pooler.supabase.com` host) →
     `MIGRATION_DATABASE_URL`, used by migrations, seeding and `create-admin`. Don't use
     the "Direct connection" string: on the free plan it's IPv6-only, which Vercel's build
     machines and many networks can't reach.

### 2. Vercel project

1. **Add New → Project**, import the GitHub repository, and keep the SvelteKit preset.
   `vercel.json` sets the build command, so leave the build settings alone.
2. Project name: this gives the URL, `https://<name>.vercel.app`. That URL is `ORIGIN`.
3. **Node.js version: 24.x** (Settings → Build and Deployment).
4. **Environment variables**, scoped to **Production** (see `env.vercel.example`):

   | Variable                    | Value                                                                            |
   | --------------------------- | -------------------------------------------------------------------------------- |
   | `DATABASE_URL`              | transaction pooler string (port 6543)                                            |
   | `MIGRATION_DATABASE_URL`    | session pooler string (port 5432)                                                |
   | `ORIGIN`                    | `https://<name>.vercel.app`, no trailing slash                                   |
   | `BETTER_AUTH_SECRET`        | a fresh one; don't reuse staging's or your dev one                               |
   | `PUBLIC_MAP_DEFAULT_EXTENT` | `conus`                                                                          |
   | `PUBLIC_BASEMAP_STYLE_URL`  | optional: leave it out for OpenFreeMap Positron. An empty value means no basemap |

   Generate the secret with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

   Create `DATABASE_URL`, `MIGRATION_DATABASE_URL` and `BETTER_AUTH_SECRET` as **Secret**,
   not Config: the first two carry the database password. A Config variable can't be
   switched to Secret reliably (the dashboard may fail with "Failed to verify the
   project's public environment variable prefix"). Delete it and add it again as Secret,
   or from the CLI, which prompts for the value so it stays out of shell history:
   `pnpm dlx vercel env add DATABASE_URL production --visibility secret` (after
   `vercel login` and `vercel link`). The rest can be Config.

   After you change a variable, redeploy: a deployment keeps the values it was built with.

5. Deploy. The production build migrates and seeds the empty database (all 0000–0008
   migrations and the county table), then builds. The build log shows both steps.

### 3. First admin

`create-admin` runs from your machine against the session pooler. Put the Vercel values in
a local `.env.vercel` (`.gitignore` already covers `.env.*`), using
`MIGRATION_DATABASE_URL`'s value **as `DATABASE_URL`**:

```bash
DATABASE_URL="postgres://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
BETTER_AUTH_SECRET="<the same secret as Vercel's>"
ORIGIN="https://<name>.vercel.app"
```

```bash
pnpm exec tsx --env-file=.env.vercel scripts/create-admin.ts --email you@wisc.edu --name "Your Name"
```

It prints a generated password. Invite everyone else from `/admin/users`.

### 4. Smoke test

- `https://<name>.vercel.app/health` returns 200.
- The map draws counties (and the basemap, if configured).
- Sign in and out. Invite a test reporter, open the link in a private window, and sign in
  as them.
- Six wrong passwords for one address give "Too many attempts". Then sign in
  from another network (a phone off Wi-Fi): it isn't blocked, which shows the limit sees
  real client addresses.

## Day to day

- **Deploying:** push to `main`. Vercel builds, migrates, and switches over when the build
  succeeds. If the build fails (a migration included), the previous deployment keeps
  serving.
- **Rolling back:** Deployments → a previous one → **Instant Rollback**. As with
  `deploy.sh rollback`, migrations are not undone.
- **Preview deployments** (other branches, pull requests) build without migrating, because
  they would share the production database. Sign-in doesn't work on their URLs, since
  Better Auth accepts only `ORIGIN`, but the public pages do. Give them variables of their
  own under the Preview scope only if you want them.
- **Test data:** `pnpm seed:dev` refuses any `ORIGIN` other than localhost, so it can't run
  here. Load detections with the CSV import instead.

## Before real accounts go on it

- **Supabase free projects pause after about a week without activity.** A paused project
  must be restored from the dashboard, and the site returns errors until then.
- **Vercel's Hobby plan is for non-commercial personal use.** Check whether a university
  extension project fits, or use Pro.
- **Accounts live with a third party.** Detections are public anyway, but specialists'
  email addresses and password hashes would be stored on Supabase. Check the university's
  policy on that.
- **Backups:** check what your Supabase plan keeps, and for how long.
