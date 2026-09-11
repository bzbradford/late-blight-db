/**
 * Cross-component request for the map to recentre on a county.
 *
 * The selected county itself lives in the URL — that is the single owner, so the map and
 * the feed cannot disagree about it. But *recentring* is not part of that state: clicking
 * a county on the map must not make the map fly (the user is already looking at it), while
 * clicking a card in the feed must. The difference is the origin of the selection, which a
 * URL parameter cannot express.
 *
 * The nonce makes repeat requests for the same county distinct, so clicking the same card
 * twice flies twice.
 */
type FlyRequest = { fips: string; nonce: number };

let request = $state<FlyRequest | null>(null);

export function requestFlyTo(fips: string) {
	request = { fips, nonce: (request?.nonce ?? 0) + 1 };
}

export function flyRequest(): FlyRequest | null {
	return request;
}
