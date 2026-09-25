import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** An older address for the detection list; `/admin` maps its filters onto `/detections`. */
export const GET: RequestHandler = ({ url }) => {
	redirect(308, `/admin${url.search}`);
};
