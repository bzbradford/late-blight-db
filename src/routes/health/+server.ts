import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * For the deploy script and any uptime monitor: 200 when the app can reach its
 * database, 503 when it can't. Says nothing else about the app.
 */
export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`select 1`);
		return new Response('ok\n', { headers: { 'cache-control': 'no-store' } });
	} catch {
		return new Response('database unavailable\n', {
			status: 503,
			headers: { 'cache-control': 'no-store' }
		});
	}
};
