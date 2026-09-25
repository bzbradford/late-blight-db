import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

/**
 * `prepare: false` so the app can connect through a transaction-mode pooler (Supabase's
 * Supavisor on port 6543, PgBouncer), which hands each transaction to whichever server
 * connection is free: a statement prepared on one isn't there on the next. The cost, a
 * parse per query, doesn't show at this app's scale. `idle_timeout` returns connections
 * that a paused serverless instance would otherwise hold open.
 */
const client = postgres(env.DATABASE_URL, { prepare: false, idle_timeout: 20 });

export const db = drizzle(client, { schema });
