#!/bin/sh
# Vercel's build command (vercel.json). Production builds migrate and seed first, as
# deploy.sh does on the server, so a deployment never runs against an older schema; a
# failure here fails the build, and the previous deployment keeps serving. Preview
# builds only build: they share the production database, and must not migrate it.
#
# Migrations go through MIGRATION_DATABASE_URL, Supabase's session pooler, when it is
# set: the app's DATABASE_URL is the transaction pooler, which is fine for the app but
# not for drizzle-kit. See deploy/VERCEL.md.
set -eu

if [ "${VERCEL_ENV:-}" = "production" ]; then
	echo "Migrating and seeding reference data"
	DATABASE_URL="${MIGRATION_DATABASE_URL:-$DATABASE_URL}" pnpm exec drizzle-kit migrate
	# Not `pnpm seed`: that reads .env, which a Vercel build doesn't have.
	DATABASE_URL="${MIGRATION_DATABASE_URL:-$DATABASE_URL}" pnpm exec tsx scripts/seed.ts
fi

pnpm build
