import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The detection list lives at `/admin` now; keep old links and bookmarks working. */
export const GET: RequestHandler = ({ url }) => {
	redirect(308, `/admin${url.search}`);
};
