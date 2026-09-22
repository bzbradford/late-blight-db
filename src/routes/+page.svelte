<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import DetectionFeed from '$lib/components/DetectionFeed.svelte';
	import DetectionMap from '$lib/components/DetectionMap.svelte';
	import Header from '$lib/components/shell/Header.svelte';
	import Legend from '$lib/components/shell/Legend.svelte';
	import { symbologyMode } from '$lib/map/symbology';
	import { requestFlyTo } from '$lib/state/selection.svelte';
	import { ViewState } from '$lib/state/view.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// `data` is only the arrival view. From here on the view state owns disease, year,
	// and selection, and `data` is never re-read — the page does not navigate again.
	const view = untrack(() => new ViewState(data, data.selectedCounty));

	let mode = $derived(symbologyMode(view.year));

	let downloadHref = $derived(
		`${resolve('/detections.csv')}?${new URLSearchParams({ disease: view.disease, year: String(view.year) })}`
	);
	let activeDiseaseName = $derived(data.diseases.find((d) => d.slug === view.disease)?.name ?? '');

	/**
	 * On narrow screens the map and the feed cannot share the viewport, so they become
	 * two views behind a switch. On desktop both are visible and this is ignored.
	 */
	let mobileView = $state<'map' | 'list'>('map');

	// A share link has done its job once the view is open. Clear the address bar so the
	// page reads as the app rather than as one particular link. This waits for the
	// arrival navigation to finish: `onMount` runs before the router has hydrated, and
	// `replaceState` then throws inside SvelteKit.
	afterNavigate(({ type }) => {
		if (type === 'enter' && page.url.search) replaceState(resolve('/'), {});
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
</svelte:head>

<!-- The branding bar sits above this in the root layout; together they fill the viewport. -->
<div class="flex h-[calc(100dvh-var(--brand-bar-h))] flex-col">
	<Header diseases={data.diseases} {view} />

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
			onclick={() => (mobileView = 'list')}>Detections</button
		>
	</div>

	<!-- Dimmed while a switch loads, so the previous disease-year's colours never read as the new one's. -->
	<main
		aria-busy={view.loading}
		class="flex min-h-0 flex-1 flex-col transition-opacity md:flex-row {view.loading
			? 'opacity-50'
			: ''}"
	>
		<section
			aria-label="Detection map"
			class="relative min-h-0 flex-1 {mobileView === 'map' ? 'flex' : 'hidden'} md:flex"
		>
			<div class="flex-1">
				<DetectionMap
					aggregates={view.aggregates}
					detections={view.detections}
					{mode}
					year={view.year}
					selectedCounty={view.selectedCounty}
					onSelect={(fips) => view.select(fips)}
				/>
			</div>
			<div class="absolute bottom-4 left-4 w-56">
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
				{downloadHref}
				onSelect={(fips) => view.select(fips)}
			/>
		</aside>
	</main>
</div>
