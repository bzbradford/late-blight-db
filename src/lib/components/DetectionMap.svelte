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
		Popup,
		type ExpressionSpecification,
		type LngLatLike,
		type PointLike,
		type StyleSpecification
	} from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { feature } from 'topojson-client';
	import type { FeatureCollection } from 'geojson';
	import HouseIcon from '@lucide/svelte/icons/house';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import ScanSearchIcon from '@lucide/svelte/icons/scan-search';
	import { basemapStyleUrl, fallbackStyle } from '$lib/map/basemap';
	import { geometryBounds, unionBounds } from '$lib/map/bounds';
	import { attributionText, composeImage, downloadCanvas } from '$lib/map/export-image';
	import { defaultExtent, expandExtent, type Extent } from '$lib/map/extent';
	import {
		clearColorCache,
		legendCaption,
		legendFor,
		NO_DETECTIONS_LABEL,
		resolveToken,
		tokenFor,
		type CountyAggregate,
		type SymbologyMode
	} from '$lib/map/symbology';
	import { formatMonthDay, tooltipContent, type TooltipCounty } from '$lib/map/tooltip';
	import CountyLabels, { type LabelItem, type LabelLayout } from './map/CountyLabels.svelte';
	import type { Detection } from '$lib/server/queries/detections';
	import { flyRequest } from '$lib/state/selection.svelte';
	import { theme, type Theme } from '$lib/state/theme.svelte';

	type Aggregate = CountyAggregate & { name: string; stateUsps: string; lon: number; lat: number };

	type Props = {
		aggregates: Aggregate[];
		/** Newest first, as the server returns them. */
		detections: Detection[];
		mode: SymbologyMode;
		year: number;
		selectedCounty: string | null;
		onSelect: (fips: string | null) => void;
		/** Detections to label (see `selectLabels`), or null when labels are off. */
		labels: Detection[] | null;
		/** Out: labels as drawn, for the image export. */
		labelLayout?: LabelLayout[];
	};

	let {
		aggregates,
		detections,
		mode,
		year,
		selectedCounty,
		onSelect,
		labels,
		labelLayout = $bindable([])
	}: Props = $props();

	maplibreConfig.WORKER_URL = maplibreWorkerUrl;

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined;
	/** The same map, as state: set once it is ready, so the label overlay can mount. */
	let liveMap = $state.raw<MapLibreMap | undefined>();
	/** Full county names ("Dane County") from the topology, for label text. */
	let countyNames = $state.raw<Map<string, string>>(new Map());
	let ready = $state(false);
	/** County data is drawn and the map has stopped moving — it can be hit-tested. */
	let settled = $state(false);
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
	const COUNTY_FILL = 'county-fill';

	/** "Zoom to detections" stops here, so one small county does not fill the screen. */
	const DETECTIONS_MAX_ZOOM = 7;

	let byFips = $derived(new Map(aggregates.map((a) => [a.fips, a])));

	/** Each county's most recent detection. `detections` is newest first, so first wins. */
	let latestByFips = $derived.by(() => {
		// Rebuilt whole on every derivation and never mutated afterwards.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const latest = new Map<string, Detection>();
		for (const d of detections) if (!latest.has(d.countyFips)) latest.set(d.countyFips, d);
		return latest;
	});

	// Kept outside reactive state: loaded once, and needed again to rebuild the data
	// layers whenever a theme change swaps the basemap style out from under them.
	let countyGeo: FeatureCollection | undefined;
	let stateGeo: FeatureCollection | undefined;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- filled once, never observed
	const countyBounds = new Map<string, Extent>();

	let labelItems = $derived.by((): LabelItem[] => {
		if (!labels) return [];
		return labels.flatMap((d) => {
			const aggregate = byFips.get(d.countyFips);
			if (!aggregate) return [];
			const name = countyNames.get(d.countyFips) ?? d.countyName;
			return [
				{
					id: d.countyFips,
					text: `${name}, ${d.stateUsps} · ${formatMonthDay(d.observedOn)}`,
					lngLat: [aggregate.lon, aggregate.lat]
				}
			];
		});
	});

	/** The theme the current style was built for. */
	let appliedTheme: Theme = 'light';

	/**
	 * The theme actually on the page. The `.dark` class is set before first paint by
	 * `app.html`, whereas `theme.current` only catches up once the root layout mounts —
	 * after this component has started building the map.
	 */
	function documentTheme(): Theme {
		return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
	}

	function styleFor(t: Theme): string | StyleSpecification {
		return basemapStyleUrl(t) ?? fallbackStyle();
	}

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

	/**
	 * Adds the county and state layers to the current style, resolving colours for the
	 * current theme. Runs on first load and again after every style swap, which discards
	 * all custom sources and layers.
	 */
	function addDataLayers(m: MapLibreMap) {
		// Two quick theme toggles can queue two `style.load` handlers for one load.
		if (!countyGeo || !stateGeo || m.getSource(COUNTY_SRC)) return;

		m.addSource(COUNTY_SRC, { type: 'geojson', data: countyGeo, promoteId: 'fips' });
		m.addSource(STATE_SRC, { type: 'geojson', data: stateGeo });

		// Insert the data layers above every basemap fill and line (roads, water) but
		// beneath the labels, or the county fill hides the place names and the map is
		// hard to orient in. "Before the first symbol layer" is not enough: some styles
		// (OpenFreeMap Dark) put an early label before the roads, which then draw on top
		// of the counties.
		const layers = m.getStyle().layers;
		const lastNonLabel = layers.findLastIndex((l) => l.type !== 'symbol');
		const firstLabel = layers[lastNonLabel + 1]?.id;

		m.addLayer(
			{
				id: COUNTY_FILL,
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
				filter: ['==', ['get', 'fips'], selectedCounty ?? ''],
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
	}

	function applyFeatureState() {
		if (!map?.getSource(COUNTY_SRC)) return;
		map.removeFeatureState({ source: COUNTY_SRC });
		for (const [fips, aggregate] of byFips) {
			const token = tokenFor(aggregate, mode);
			if (token) map.setFeatureState({ source: COUNTY_SRC, id: fips }, { token });
		}
	}

	/** The default view: the configured extent, widened to include every detection. */
	function fitDefault(animate: boolean) {
		if (!map) return;
		// The configured extent is a minimum: widen it when detections fall outside so
		// a report beyond the regional default is never silently off-screen.
		const [w, s, e, n] = expandExtent(defaultExtent(), aggregates);
		map.fitBounds(
			[
				[w, s],
				[e, n]
			],
			{ padding: 24, animate, duration: 600 }
		);
	}

	function zoomToDetections() {
		const boxes = aggregates.flatMap((a) => {
			const box = countyBounds.get(a.fips);
			return box ? [box] : [];
		});
		const extent = unionBounds(boxes);
		if (!map || !extent) return;
		const [w, s, e, n] = extent;
		map.fitBounds(
			[
				[w, s],
				[e, n]
			],
			{ padding: 72, maxZoom: DETECTIONS_MAX_ZOOM, duration: 600 }
		);
	}

	/**
	 * Swaps the basemap for the other theme. A style swap discards every custom source
	 * and layer, and with them all feature state — so the data layers are rebuilt, with
	 * freshly resolved colours, once the new style has loaded.
	 */
	function restyle(t: Theme) {
		const m = map;
		if (!m) return;
		appliedTheme = t;
		clearColorCache();
		hideTooltip();
		m.once('style.load', () => {
			addDataLayers(m);
			applyFeatureState();
		});
		// `diff: false` forces a full reload, so `style.load` always fires. A diff against
		// the fallback style (which differs only in background colour) would skip it —
		// and also silently delete the data layers, which the new style does not list.
		m.setStyle(styleFor(t), { diff: false });
	}

	// --- Tooltip -----------------------------------------------------------------------

	// `pointer-events: none` (in the style block below) keeps the pointer on the map, not the popup,
	// so moving across the tooltip does not register as leaving the county.
	const popup = new Popup({
		closeButton: false,
		closeOnClick: false,
		offset: 14,
		maxWidth: '280px',
		className: 'county-tooltip'
	});
	let tooltipFips: string | null = null;

	function countyAt(m: MapLibreMap, point: PointLike): (TooltipCounty & { fips: string }) | null {
		// The layer briefly does not exist while a theme change rebuilds the style.
		if (!m.getLayer(COUNTY_FILL)) return null;
		const props = m.queryRenderedFeatures(point, { layers: [COUNTY_FILL] })[0]?.properties;
		if (typeof props?.fips !== 'string') return null;
		return {
			fips: props.fips,
			name: String(props.name ?? ''),
			stateName: String(props.state_name ?? '')
		};
	}

	/**
	 * Built with DOM nodes and `textContent`, never an HTML string: crop and strain are
	 * free text typed by admins.
	 */
	function tooltipNode(county: TooltipCounty & { fips: string }): HTMLElement {
		const aggregate = byFips.get(county.fips);
		const content = tooltipContent(
			county,
			year,
			aggregate?.count ?? 0,
			latestByFips.get(county.fips)
		);

		const root = document.createElement('div');
		const title = document.createElement('p');
		title.className = 'font-medium text-popover-foreground';
		title.textContent = content.title;
		root.append(title);
		for (const line of content.lines) {
			const p = document.createElement('p');
			p.className = 'text-muted-foreground';
			p.textContent = line;
			root.append(p);
		}
		return root;
	}

	function showTooltip(county: TooltipCounty & { fips: string }, at: LngLatLike) {
		if (!map) return;
		if (county.fips !== tooltipFips) {
			popup.setDOMContent(tooltipNode(county));
			tooltipFips = county.fips;
		}
		popup.setLngLat(at);
		if (!popup.isOpen()) popup.addTo(map);
	}

	function hideTooltip() {
		popup.remove();
		tooltipFips = null;
	}

	// --- Save image ----------------------------------------------------------------------

	/**
	 * Saves the map as a PNG for a newsletter: the current view and theme, the county
	 * labels where the admin arranged them, the legend, a title, and credits.
	 *
	 * Called by the page through `bind:this`.
	 */
	export async function saveImage(opts: { title: string; subtitle: string; fileName: string }) {
		const m = map;
		if (!m) return;

		// Sharp in print: at least 2×, more on a high-density screen that already is.
		const previousRatio = m.getPixelRatio();
		const scale = Math.max(2, previousRatio);
		// The selection outline is interaction state, not content.
		m.setFilter('county-selected', ['==', ['get', 'fips'], '']);
		m.setPixelRatio(scale);

		try {
			// Wait for tiles at the new resolution, but never hang on a slow tile host.
			await Promise.race([m.once('idle'), new Promise((r) => setTimeout(r, 8000))]);

			// A WebGL canvas is cleared after it is composited, so copy it inside the render
			// callback, while the frame is still there. (`preserveDrawingBuffer` would avoid
			// this, at a permanent performance cost for an occasional action.)
			const frame = await new Promise<HTMLCanvasElement>((resolve) => {
				m.once('render', () => {
					const source = m.getCanvas();
					const copy = document.createElement('canvas');
					copy.width = source.width;
					copy.height = source.height;
					copy.getContext('2d')?.drawImage(source, 0, 0);
					resolve(copy);
				});
				m.triggerRepaint();
			});

			// Text drawn before the web font loads falls back to a default face.
			await document.fonts.ready;

			// Credits as MapLibre's own attribution control shows them. The style's sources
			// can't be used: OpenFreeMap's credits arrive in TileJSON at runtime, not in the
			// style — reading the style gave an image with no OpenStreetMap credit at all.
			const attribution = basemapFailed
				? ''
				: attributionText([
						container.querySelector('.maplibregl-ctrl-attrib-inner')?.innerHTML ?? ''
					]);

			const canvas = composeImage({
				map: frame,
				cssWidth: m.getCanvas().clientWidth,
				cssHeight: m.getCanvas().clientHeight,
				scale,
				labels: labelLayout,
				legend: {
					caption: legendCaption(mode, year),
					entries: [
						...legendFor(mode).map((e) => ({ color: resolveToken(e.token), label: e.label })),
						{ color: resolveToken('--county-none'), label: NO_DETECTIONS_LABEL }
					]
				},
				title: opts.title,
				subtitle: opts.subtitle,
				attribution,
				credit: 'University of Wisconsin–Madison',
				source: window.location.host,
				colors: {
					background: resolveToken('--background'),
					foreground: resolveToken('--foreground'),
					muted: resolveToken('--muted-foreground'),
					border: resolveToken('--border'),
					card: resolveToken('--card'),
					brand: resolveToken('--brand-uw')
				},
				font: getComputedStyle(document.body).fontFamily
			});
			await downloadCanvas(canvas, opts.fileName);
		} finally {
			m.setPixelRatio(previousRatio);
			m.setFilter('county-selected', ['==', ['get', 'fips'], selectedCounty ?? '']);
		}
	}

	// --- Setup -------------------------------------------------------------------------

	async function init(signal: { disposed: boolean }) {
		appliedTheme = documentTheme();

		const m = new MapLibreMap({
			container,
			style: styleFor(appliedTheme),
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

		// Fetched alongside the basemap style rather than after it: the topology is the
		// larger download, and nothing about it depends on the style.
		const topology = Promise.all([
			loadTopology('/geo/counties.topo.json', 'counties'),
			loadTopology('/geo/states.topo.json', 'states')
		]);
		// Handled when awaited below; this only stops an early unmount reporting it as unhandled.
		topology.catch(() => {});

		await m.once('load');
		if (signal.disposed) return;

		[countyGeo, stateGeo] = await topology;
		// The component may have unmounted while the topology was in flight.
		if (signal.disposed) return;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built once, then replaced whole
		const names = new Map<string, string>();
		for (const f of countyGeo.features) {
			const fips = f.properties?.fips;
			if (typeof fips !== 'string') continue;
			const box = f.geometry ? geometryBounds(f.geometry) : null;
			if (box) countyBounds.set(fips, box);
			names.set(fips, String(f.properties?.name ?? ''));
		}
		countyNames = names;

		addDataLayers(m);

		// Handlers are registered on the map rather than on the layer, and look the layer
		// up at event time, so they survive a theme change rebuilding the style.
		m.on('mousemove', (ev) => {
			const county = countyAt(m, ev.point);
			// Only counties with detections are selectable, so only they look clickable.
			m.getCanvas().style.cursor = county && byFips.has(county.fips) ? 'pointer' : '';
			// Shown even while labelling: labels are on by default, and "Save image" draws
			// the map from data, so a tooltip never ends up in an exported picture.
			if (county) showTooltip(county, ev.lngLat);
			else hideTooltip();
		});
		m.on('mouseout', hideTooltip);
		m.on('dragstart', hideTooltip);

		m.on('click', (ev) => {
			const county = countyAt(m, ev.point);
			if (county && byFips.has(county.fips)) {
				onSelect(county.fips === selectedCounty ? null : county.fips);
			} else if (selectedCounty) {
				// A county with nothing in it is not a selection, only a way out of one.
				onSelect(null);
			}
			// Touch screens have no hover, so a tap is the only way to see the tooltip.
			if (county) showTooltip(county, ev.lngLat);
		});

		map = m;
		liveMap = m;
		applyFeatureState();
		fitDefault(false);
		ready = true;

		// Not the `idle` event: that waits for every basemap tile, which ties readiness
		// to a third-party tile host's response time. Our own data being drawn, and the
		// arrival fly having finished, is what "the map is usable" means here.
		//
		// Checked on several events because none alone is enough: the last `render` of an
		// animation can fire while `isMoving()` is still true, and nothing renders after.
		const events = ['render', 'moveend', 'sourcedata'] as const;
		const checkSettled = () => {
			if (!m.getSource(COUNTY_SRC) || !m.isSourceLoaded(COUNTY_SRC) || m.isMoving()) return;
			settled = true;
			for (const e of events) m.off(e, checkSettled);
		};
		for (const e of events) m.on(e, checkSettled);
		checkSettled();
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
			popup.remove();
			map?.remove();
			map = undefined;
			liveMap = undefined;
			ready = false;
		};
	});

	// Recolour when the disease-year changes. `byFips` and `mode` are the dependencies.
	$effect(() => {
		void byFips;
		void mode;
		if (ready) {
			untrack(() => {
				// The open tooltip describes the previous disease-year.
				hideTooltip();
				applyFeatureState();
				fitDefault(true);
			});
		}
	});

	// Rebuild the style when the theme changes. `theme.current` is only the trigger —
	// the `.dark` class is the source of truth (see `documentTheme`).
	$effect(() => {
		void theme.current;
		if (!ready) return;
		untrack(() => {
			const next = documentTheme();
			if (next !== appliedTheme) restyle(next);
		});
	});

	/**
	 * Recentre when the feed asks. Deliberately not driven by `selectedCounty`: clicking a
	 * county on the map must not move the map out from under the pointer.
	 */
	$effect(() => {
		const req = flyRequest();
		if (!ready || !map || !req) return;
		// Untracked: otherwise every disease-year change re-runs this effect, replays the
		// last request, and flies back to the old county over the top of `fitDefault`.
		const target = untrack(() => aggregates.find((a) => a.fips === req.fips));
		if (!target) return;
		const m = map;
		// Untracked: easing can fire map events synchronously, and their handlers must not
		// become dependencies of this effect.
		untrack(() =>
			m.easeTo({
				center: [target.lon, target.lat],
				zoom: Math.max(m.getZoom(), 6),
				duration: 700
			})
		);
	});

	// Highlight the selected county without touching the fill layer.
	$effect(() => {
		const fips = selectedCounty;
		if (ready && map?.getLayer('county-selected')) {
			map.setFilter('county-selected', ['==', ['get', 'fips'], fips ?? '']);
		}
	});
</script>

<div class="relative h-full w-full">
	<div
		bind:this={container}
		class="h-full w-full"
		role="application"
		aria-label="County detection map"
		data-map-settled={settled ? '' : undefined}
	></div>

	{#if liveMap && labels}
		<!-- Keyed on the data, so dragged positions reset when the disease or year changes. -->
		{#key aggregates}
			<CountyLabels
				map={liveMap}
				items={labelItems}
				onSelect={(fips) => onSelect(fips)}
				bind:layout={labelLayout}
			/>
		{/key}
	{/if}

	<div
		data-map-obstacle
		class="absolute top-2.5 left-2.5 flex flex-col overflow-hidden rounded-md border bg-background shadow-sm"
	>
		<button
			type="button"
			class="grid size-8 place-items-center text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-40"
			aria-label="Reset view"
			title="Reset view"
			disabled={!ready}
			onclick={() => fitDefault(true)}
		>
			<HouseIcon class="size-4" aria-hidden="true" />
		</button>
		<button
			type="button"
			class="grid size-8 place-items-center border-t text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-40"
			aria-label="Zoom to detections"
			title="Zoom to detections"
			disabled={!ready || aggregates.length === 0}
			onclick={zoomToDetections}
		>
			<ScanSearchIcon class="size-4" aria-hidden="true" />
		</button>
	</div>

	{#if !ready && !initFailed}
		<div
			role="status"
			class="pointer-events-none absolute inset-0 grid place-items-center bg-background/60"
		>
			<p
				class="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-sm"
			>
				<LoaderCircleIcon
					class="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
					aria-hidden="true"
				/>
				Loading map…
			</p>
		</div>
	{/if}

	{#if initFailed || basemapFailed}
		<p
			class="absolute bottom-8 left-1/2 -translate-x-1/2 rounded border bg-background/90 px-2 py-1 text-xs whitespace-nowrap text-muted-foreground"
		>
			{initFailed
				? 'The map could not be displayed. The detection list is still available.'
				: 'Basemap unavailable — county data is still shown.'}
		</p>
	{/if}
</div>

<style>
	/* MapLibre's popup and controls are white by default; bring them onto the theme. */
	/*
	 * The county labels are an overlay after the map in the DOM, so without a z-index they
	 * paint over the popup. The tooltip is transient and under the pointer; it goes on top.
	 */
	:global(.county-tooltip) {
		pointer-events: none;
		z-index: 10;
	}
	:global(.county-tooltip .maplibregl-popup-content) {
		background: var(--popover);
		color: var(--popover-foreground);
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		font: inherit;
		font-size: 0.75rem;
		line-height: 1.4;
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.12);
	}
	/* The tip would need recolouring for every anchor position; a floating card reads fine. */
	:global(.county-tooltip .maplibregl-popup-tip) {
		display: none;
	}
	:global(.dark .maplibregl-ctrl-group) {
		background: var(--background);
		box-shadow: 0 0 0 1px var(--border);
	}
	:global(.dark .maplibregl-ctrl-group button + button) {
		border-top-color: var(--border);
	}
	:global(.dark .maplibregl-ctrl-group .maplibregl-ctrl-icon) {
		filter: invert(1);
	}
	:global(.dark .maplibregl-ctrl-attrib) {
		background: color-mix(in oklch, var(--background) 85%, transparent);
		color: var(--muted-foreground);
	}
	:global(.dark .maplibregl-ctrl-attrib a) {
		color: var(--muted-foreground);
	}
	:global(.dark .maplibregl-ctrl-attrib-button) {
		filter: invert(1);
	}
</style>
