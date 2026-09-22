import { resolve } from '$app/paths';
import type { ViewData } from '$lib/server/view';

/**
 * What the public map is showing: disease, year, the data behind them, and the
 * selected county.
 *
 * None of this lives in the URL. The page always opens in the default view, and a view
 * is passed on deliberately through `shareUrl()`, whose parameters the page reads once
 * on arrival and then strips from the address bar.
 *
 * This is a class the page instantiates, not a module-level singleton: module state is
 * shared by every request during SSR, so a singleton would leak one visitor's view
 * into another's render.
 */
export class ViewState {
	disease = $state('');
	year = $state(0);
	years = $state.raw<number[]>([]);
	aggregates = $state.raw<ViewData['aggregates']>([]);
	detections = $state.raw<ViewData['detections']>([]);
	selectedCounty = $state<string | null>(null);

	/** A disease-year switch is in flight. The data shown is still the previous one. */
	loading = $state(false);
	error = $state<string | null>(null);

	#inflight: AbortController | null = null;

	constructor(initial: ViewData, selectedCounty: string | null) {
		this.#apply(initial);
		this.selectedCounty = selectedCounty;
	}

	#apply(data: ViewData) {
		this.disease = data.activeDisease;
		this.year = data.activeYear;
		this.years = data.years;
		this.aggregates = data.aggregates;
		this.detections = data.detections;
	}

	/**
	 * Switches disease and/or year. The server falls back to a year that exists when the
	 * requested one has no data for this disease, so keeping the year across a disease
	 * switch is safe.
	 *
	 * Disease and year only change once the data arrives, so the header never claims a
	 * view the map and feed are not showing yet.
	 */
	async show(disease: string, year: number) {
		this.#inflight?.abort();
		const controller = new AbortController();
		this.#inflight = controller;
		this.loading = true;
		this.error = null;

		// A throwaway builder, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams({ disease, year: String(year) });
		try {
			const res = await fetch(`${resolve('/api/view')}?${params}`, { signal: controller.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data: ViewData = await res.json();
			// A county selected under one disease-year usually has nothing in another.
			this.selectedCounty = null;
			this.#apply(data);
		} catch {
			// A newer switch superseded this one; it owns the loading and error state now.
			if (controller.signal.aborted) return;
			this.error = 'The detections could not be loaded. Please try again.';
		} finally {
			if (this.#inflight === controller) {
				this.#inflight = null;
				this.loading = false;
			}
		}
	}

	select(fips: string | null) {
		this.selectedCounty = fips;
	}

	/**
	 * A link that reopens this view in any browser.
	 *
	 * Disease and year are always included, even when they are today's defaults: the
	 * default year moves on every January, and a link sent in a newsletter must still
	 * show the season it was sent about.
	 */
	shareUrl(origin: string): string {
		// A throwaway builder, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams({ disease: this.disease, year: String(this.year) });
		if (this.selectedCounty) params.set('county', this.selectedCounty);
		return `${origin}${resolve('/')}?${params}`;
	}
}
