<script lang="ts">
	import { untrack } from 'svelte';
	// MapLibre resolves its worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`,
	// which Vite cannot analyse statically — so the worker is never emitted and the built
	// page fails to load it, leaving the map stuck before `load` and silently blank.
	// Importing it through Vite's worker pipeline emits a real bundle and gives us its URL.
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import {
		config as maplibreConfig,
		Map as MapLibreMap,
		NavigationControl,
		type ExpressionSpecification,
		type MapMouseEvent
	} from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { feature } from 'topojson-client';
	import type { FeatureCollection } from 'geojson';
	import { basemapStyleUrl, fallbackStyle } from '$lib/map/basemap';
	import { defaultExtent, expandExtent } from '$lib/map/extent';
	import { flyRequest } from '$lib/state/selection.svelte';
	import {
		resolveToken,
		tokenFor,
		type CountyAggregate,
		type SymbologyMode
	} from '$lib/map/symbology';

	type Aggregate = CountyAggregate & { name: string; stateUsps: string; lon: number; lat: number };

	type Props = {
		aggregates: Aggregate[];
		mode: SymbologyMode;
		selectedCounty: string | null;
		onSelect: (fips: string | null) => void;
	};

	let { aggregates, mode, selectedCounty, onSelect }: Props = $props();

	maplibreConfig.WORKER_URL = maplibreWorkerUrl;

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let ready = $state(false);
	let basemapFailed = $state(false);
	let initFailed = $state(false);

	/** Every token `tokenFor()` can return, in legend order. */
	const SYMBOLOGY_TOKENS = [
		'--recency-7',
		'--recency-14',
		'--recency-30',
		'--recency-old',
		'--timing-1',
		'--timing-2',
		'--timing-3',
		'--timing-4',
		'--timing-5',
		'--timing-6'
	];

	const COUNTY_SRC = 'counties';
	const STATE_SRC = 'states';

	let byFips = $derived(new Map(aggregates.map((a) => [a.fips, a])));

	async function loadTopology(url: string, layer: string): Promise<FeatureCollection> {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
		const topo = await res.json();
		// topojson-client's overloads return Feature for a single geometry and
		// FeatureCollection for a GeometryCollection; ours is always the latter.
		return feature(topo, topo.objects[layer]) as unknown as FeatureCollection;
	}

	/**
	 * Fill colour is driven by feature state rather than by rewriting the source, so
	 * recolouring on a disease/year change never re-parses 3,143 polygons.
	 */
	/**
	 * Fill colour is driven by feature state rather than by rewriting the source, so
	 * recolouring on a disease/year change never re-parses 3,000-odd polygons.
	 *
	 * `feature-state` is typed `value`, which MapLibre will not compare against a string
	 * directly — the expression fails its static type check and `addLayer` throws. The
	 * `to-string` coercion is what makes `match` legal here.
	 */
	function fillColorExpression(): ExpressionSpecification {
		const branches = SYMBOLOGY_TOKENS.flatMap((token) => [token, resolveToken(token)]);
		return [
			'match',
			['to-string', ['feature-state', 'token']],
			...branches,
			resolveToken('--county-none')
		] as unknown as ExpressionSpecification;
	}

	function applyFeatureState() {
		if (!map?.getSource(COUNTY_SRC)) return;
		map.removeFeatureState({ source: COUNTY_SRC });
		for (const [fips, aggregate] of byFips) {
			const token = tokenFor(aggregate, mode);
			if (token) map.setFeatureState({ source: COUNTY_SRC, id: fips }, { token });
		}
	}

	function fitToData(animate: boolean) {
		if (!map) return;
		// The configured extent is a minimum: widen it when detections fall outside so
		// an Alaska or Hawaii report is never silently off-screen.
		const [w, s, e, n] = expandExtent(defaultExtent(), aggregates);
		map.fitBounds(
			[
				[w, s],
				[e, n]
			],
			{ padding: 24, animate, duration: 600 }
		);
	}

	async function init(signal: { disposed: boolean }) {
		const styleUrl = basemapStyleUrl();

		const m = new MapLibreMap({
			container,
			style: styleUrl ?? fallbackStyle(),
			attributionControl: { compact: true },
			// Counties are meaningless past this zoom and the basemap is only context.
			maxZoom: 10,
			minZoom: 2
		});

		// A dead tile host must not take the whole map with it — the county layers carry
		// the actual information, so fall back to a plain background and carry on.
		m.on('error', (ev: { error?: { message?: string } }) => {
			const msg = String(ev?.error?.message ?? '');
			if (!basemapFailed && (msg.includes('style') || msg.includes('Failed to fetch'))) {
				basemapFailed = true;
				return;
			}
			// Everything else must stay visible. MapLibre reports an invalid layer here
			// rather than throwing, and silently skips it — which looks exactly like a
			// working map with no data on it.
			console.error('MapLibre error:', msg);
		});

		m.addControl(new NavigationControl({ showCompass: false }), 'top-right');

		await m.once('load');
		if (signal.disposed) return;

		const [countyGeo, stateGeo] = await Promise.all([
			loadTopology('/geo/counties.topo.json', 'counties'),
			loadTopology('/geo/states.topo.json', 'states')
		]);
		// The component may have unmounted while the topology was in flight.
		if (signal.disposed) return;

		m.addSource(COUNTY_SRC, { type: 'geojson', data: countyGeo, promoteId: 'fips' });
		m.addSource(STATE_SRC, { type: 'geojson', data: stateGeo });

		// Insert the data layers *beneath* the basemap's labels, or the county fill hides
		// the city and place names underneath it and the map becomes hard to orient in.
		const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;

		m.addLayer(
			{
				id: 'county-fill',
				type: 'fill',
				source: COUNTY_SRC,
				paint: { 'fill-color': fillColorExpression(), 'fill-opacity': 0.85 }
			},
			firstLabel
		);

		m.addLayer(
			{
				id: 'county-outline',
				type: 'line',
				source: COUNTY_SRC,
				paint: { 'line-color': resolveToken('--county-outline'), 'line-width': 0.4 }
			},
			firstLabel
		);

		m.addLayer(
			{
				id: 'county-selected',
				type: 'line',
				source: COUNTY_SRC,
				filter: ['==', ['get', 'fips'], ''],
				paint: { 'line-color': resolveToken('--county-selected'), 'line-width': 2.5 }
			},
			firstLabel
		);

		m.addLayer(
			{
				id: 'state-outline',
				type: 'line',
				source: STATE_SRC,
				paint: { 'line-color': resolveToken('--state-outline'), 'line-width': 0.9 }
			},
			firstLabel
		);

		m.on(
			'click',
			'county-fill',
			(ev: MapMouseEvent & { features?: Array<{ properties?: Record<string, unknown> }> }) => {
				const fips = ev.features?.[0]?.properties?.fips as string | undefined;
				if (!fips) return;
				onSelect(fips === selectedCounty ? null : fips);
			}
		);

		m.on('mouseenter', 'county-fill', () => {
			m.getCanvas().style.cursor = 'pointer';
		});
		m.on('mouseleave', 'county-fill', () => {
			m.getCanvas().style.cursor = '';
		});

		map = m;
		applyFeatureState();
		fitToData(false);
		ready = true;
	}

	$effect(() => {
		const signal = { disposed: false };
		init(signal).catch((err) => {
			// A silent rejection here leaves a blank map with nothing in the console,
			// which is exactly how a broken paint expression hides.
			console.error('Map initialisation failed', err);
			initFailed = true;
		});
		return () => {
			signal.disposed = true;
			map?.remove();
			map = undefined;
			ready = false;
		};
	});

	// Recolour when the disease-year changes. `byFips` and `mode` are the dependencies.
	$effect(() => {
		void byFips;
		void mode;
		if (ready) {
			applyFeatureState();
			fitToData(true);
		}
	});

	/**
	 * Recentre when the feed asks. Deliberately not driven by `selectedCounty`: clicking a
	 * county on the map must not move the map out from under the pointer.
	 */
	$effect(() => {
		const req = flyRequest();
		if (!ready || !map || !req) return;
		// Untracked: otherwise every disease-year change re-runs this effect, replays the
		// last request, and flies back to the old county over the top of `fitToData`.
		const target = untrack(() => aggregates.find((a) => a.fips === req.fips));
		if (!target) return;
		map.easeTo({
			center: [target.lon, target.lat],
			zoom: Math.max(map.getZoom(), 6),
			duration: 700
		});
	});

	// Highlight the selected county without touching the fill layer.
	$effect(() => {
		if (ready && map?.getLayer('county-selected')) {
			map.setFilter('county-selected', ['==', ['get', 'fips'], selectedCounty ?? '']);
		}
	});
</script>

<div class="relative h-full w-full">
	<div
		bind:this={container}
		class="h-full w-full"
		role="application"
		aria-label="County detection map"
	></div>

	{#if initFailed}
		<p
			class="absolute top-2 left-2 rounded border bg-background/90 px-2 py-1 text-xs text-muted-foreground"
		>
			The map could not be displayed. The detection list is still available.
		</p>
	{:else if basemapFailed}
		<p
			class="absolute top-2 left-2 rounded border bg-background/90 px-2 py-1 text-xs text-muted-foreground"
		>
			Basemap unavailable — county data is still shown.
		</p>
	{/if}
</div>
