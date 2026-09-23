import { daysBetween } from '$lib/map/symbology';

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/**
 * How long ago an ISO date was: days up to 30 (matching the legend's last day window),
 * then whole calendar months, then whole years. "today" for today, or for a date that
 * is ahead of this clock (a server a timezone ahead can hand over tomorrow's date).
 */
export function timeAgo(iso: string, today = new Date()): string {
	const days = daysBetween(iso, today);
	if (days <= 0) return 'today';
	if (days <= 30) return plural(days, 'day');

	const [y, m, d] = iso.split('-').map(Number);
	let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
	if (today.getDate() < d) months -= 1;
	months = Math.max(months, 1);

	if (months < 12) return plural(months, 'month');
	return plural(Math.floor(months / 12), 'year');
}
