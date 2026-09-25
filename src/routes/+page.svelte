<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import IncidentDialog from '$lib/components/admin/IncidentDialog.svelte';
	import DetectionDetail from '$lib/components/DetectionDetail.svelte';
	import DetectionFeed from '$lib/components/DetectionFeed.svelte';
	import DetectionMap from '$lib/components/DetectionMap.svelte';
	import ControlPanel from '$lib/components/shell/ControlPanel.svelte';
	import MapHeader from '$lib/components/shell/MapHeader.svelte';
	import Legend from '$lib/components/shell/Legend.svelte';
	import { selectLabels } from '$lib/map/labels';
	import { formatShortDate } from '$lib/map/tooltip';
	import { today } from '$lib/validation/incident';
	import { symbologyMode } from '$lib/map/symbology';
	import { requestFlyTo } from '$lib/state/selection.svelte';
	import { IncidentEditor } from '$lib/state/incident-editor.svelte';
	import { ViewState } from '$lib/state/view.svelte';
	import type { Detection } from '$lib/server/queries/detections';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// `data` is only the arrival view. From here on the view state owns disease, year,
	// and selection, and `data` is never re-read — the page does not navigate again.
	const view = untrack(() => new ViewState(data, data.selectedCounty, data.labels));

	let mode = $derived(symbologyMode(view.year));

	/** Shared by the panel ("showing 10 of 14") and the map, so the two can't disagree. */
	let labelSelection = $derived(
		view.labelsSince ? selectLabels(view.detections, view.labelsSince) : null
	);

	let detectionMap: DetectionMap | undefined = $state();

	/** The detection open in the detail dialog. */
	let detail = $state<Detection | null>(null);

	/**
	 * Admins can edit from the detail dialog. The editor is the admin page's own modal
	 * (its data and actions come from `/admin/incidents/[id]`, behind the admin guard);
	 * this page only hosts it, and reloads the view once something is saved.
	 */
	const editor = new IncidentEditor();

	async function editDetection(detection: Detection) {
		await editor.open(resolve('/admin/incidents/[id]', { id: String(detection.id) }));
		if (editor.current) detail = null;
	}

	/** The saved image's title and file name describe exactly what it shows. */
	function saveImage() {
		const todayIso = today();
		const parts = [
			view.year === Number(todayIso.slice(0, 4))
				? `As of ${formatShortDate(todayIso)}`
				: `${view.year} season`
		];
		if (view.labelsSince)
			parts.push(`labelled: detections since ${formatShortDate(view.labelsSince)}`);
		return (
			detectionMap?.saveImage({
				title: `${activeDiseaseName} detections · ${view.year}`,
				subtitle: parts.join(' · '),
				fileName: `${view.disease}-${view.year}-map-${todayIso}.png`
			}) ?? Promise.resolve()
		);
	}

	let downloadHref = $derived(
		`${resolve('/detections.csv')}?${new URLSearchParams({ disease: view.disease, year: String(view.year) })}`
	);
	let activeDiseaseName = $derived(data.diseases.find((d) => d.slug === view.disease)?.name ?? '');

	/** The address the page was opened at — for `og:url`, before the query is stripped. */
	const arrivalUrl = page.url.href;

	let previewDescription = $derived(
		`${view.detections.length} confirmed ${activeDiseaseName.toLowerCase()} ${
			view.detections.length === 1 ? 'detection' : 'detections'
		} in ${view.year}, by county, from university extension specialists.`
	);

	/**
	 * Spoken summary of the last change: a county selected or cleared, or a new
	 * disease-year loaded. Empty on arrival, so nothing is read out over the page load.
	 */
	let announcement = $state('');
	let announced = { county: view.selectedCounty, view: `${view.disease}/${view.year}` };
	$effect(() => {
		const county = view.selectedCounty;
		const current = `${view.disease}/${view.year}`;
		untrack(() => {
			if (current !== announced.view) {
				const n = view.detections.length;
				announcement = `Showing ${activeDiseaseName.toLowerCase()}, ${view.year}: ${n} ${n === 1 ? 'detection' : 'detections'}.`;
			} else if (county !== announced.county) {
				const matches = view.detections.filter((d) => d.countyFips === county);
				announcement =
					county && matches.length
						? `Selected ${matches[0].countyName}, ${matches[0].stateUsps}: ${matches.length} ${matches.length === 1 ? 'detection' : 'detections'}.`
						: 'Selection cleared.';
			}
			announced = { county, view: current };
		});
	});

	/**
	 * On narrow screens the map and the feed cannot share the viewport, so they become
	 * two views behind a switch. On desktop both are visible and this is ignored.
	 */
	let mobileView = $state<'map' | 'list'>('map');

	// A share link has done its job once the view is open. Clear the address bar so the
	// page reads as the app rather than as one particular link. This waits for the
	// arrival navigation to finish: `onMount` runs before the router has hydrated, and
	// `replaceState` then throws inside SvelteKit. Arrival can also be a link from another
	// page, such as a county in the detections table, not only a fresh load.
	afterNavigate(() => {
		if (page.url.search) replaceState(resolve('/'), {});
	});

	onMount(() => {
		// A shared link naming a county should arrive showing that county, not the whole
		// country. Only on arrival — afterwards the map must not chase its own click.
		if (view.selectedCounty) requestFlyTo(view.selectedCounty);
	});
</script>

<svelte:head>
	<title>{activeDiseaseName} detections, {view.year}</title>
	<meta
		name="description"
		content="County-level reports of confirmed late blight and cucurbit downy mildew detections in commercial vegetable production."
	/>
	<!--
		Link previews. Crawlers see only the server render, so these describe the view the
		link opens: a Share link names its disease and year, and the preview says so.
	-->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Vegetable Disease Detections" />
	<meta property="og:title" content="{activeDiseaseName} detections, {view.year}" />
	<meta property="og:description" content={previewDescription} />
	<meta property="og:url" content={arrivalUrl} />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<!-- Announces what changed for screen readers; the map itself can't say. -->
<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>

<!-- The branding bar sits above this in the root layout; together they fill the viewport. -->
<div class="flex h-[calc(100dvh-var(--brand-bar-h))] flex-col">
	<MapHeader diseases={data.diseases} {view} />
	<ControlPanel
		{view}
		labelTotal={labelSelection?.total ?? 0}
		{downloadHref}
		onSaveImage={saveImage}
	/>

	{#if view.error}
		<p role="alert" class="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
			{view.error}
		</p>
	{/if}

	<div class="flex items-center gap-1 border-b p-2 md:hidden">
		<button
			type="button"
			class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium {mobileView === 'map'
				? 'bg-muted text-foreground'
				: 'text-muted-foreground'}"
			aria-pressed={mobileView === 'map'}
			onclick={() => (mobileView = 'map')}>Map</button
		>
		<button
			type="button"
			class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium {mobileView === 'list'
				? 'bg-muted text-foreground'
				: 'text-muted-foreground'}"
			aria-pressed={mobileView === 'list'}
			onclick={() => (mobileView = 'list')}>List</button
		>
	</div>

	<!-- Dimmed while a switch loads, so the previous disease-year's colours never read as the new one's. -->
	<main
		aria-busy={view.loading}
		class="flex min-h-0 flex-1 flex-col transition-opacity md:flex-row {view.loading
			? 'opacity-50'
			: ''}"
	>
		<!-- data-map-root: the scope in which county labels look for things to avoid. -->
		<section
			data-map-root
			aria-label="Detection map"
			class="relative min-h-0 flex-1 {mobileView === 'map' ? 'flex' : 'hidden'} md:flex"
		>
			<div class="flex-1">
				<DetectionMap
					bind:this={detectionMap}
					aggregates={view.aggregates}
					detections={view.detections}
					{mode}
					year={view.year}
					selectedCounty={view.selectedCounty}
					onSelect={(fips) => view.select(fips)}
					labels={labelSelection?.labels ?? null}
				/>
			</div>
			<!-- On phones the attribution runs to two lines along the bottom; sit above it. -->
			<div
				class="absolute bottom-14 left-2.5 max-w-56 md:bottom-4 md:left-4 md:w-56"
				data-map-obstacle
			>
				<Legend {mode} year={view.year} />
			</div>
		</section>

		<aside
			aria-label="Detection feed"
			class="min-h-0 flex-col border-t md:flex md:w-96 md:border-t-0 md:border-l {mobileView ===
			'list'
				? 'flex'
				: 'hidden'}"
		>
			<DetectionFeed
				detections={view.detections}
				selectedCounty={view.selectedCounty}
				diseaseName={activeDiseaseName}
				year={view.year}
				{mode}
				onSelect={(fips) => view.select(fips)}
				onExpand={(detection) => (detail = detection)}
			/>
		</aside>
	</main>
</div>

<DetectionDetail
	detection={detail}
	diseaseName={activeDiseaseName}
	editing={editor.loading}
	onClose={() => (detail = null)}
	onEdit={editDetection}
/>

{#if data.signedIn}
	<IncidentDialog {editor} onChanged={() => view.refresh()} />
{/if}
