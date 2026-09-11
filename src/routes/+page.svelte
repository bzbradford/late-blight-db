<script lang="ts">
	import Header from '$lib/components/shell/Header.svelte';
	import Legend from '$lib/components/shell/Legend.svelte';
	import { symbologyMode } from '$lib/map/symbology';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let mode = $derived(symbologyMode(data.activeYear));
	let activeDiseaseName = $derived(
		data.diseases.find((d) => d.slug === data.activeDisease)?.name ?? ''
	);

	/**
	 * On narrow screens the map and the feed cannot share the viewport, so they become
	 * two views behind a switch. On desktop both are visible and this is ignored.
	 */
	let mobileView = $state<'map' | 'list'>('map');
</script>

<svelte:head>
	<title>{activeDiseaseName} detections, {data.activeYear}</title>
	<meta
		name="description"
		content="County-level reports of confirmed late blight and cucurbit downy mildew detections in commercial vegetable production."
	/>
</svelte:head>

<div class="flex h-screen flex-col">
	<Header
		diseases={data.diseases}
		years={data.years}
		activeDisease={data.activeDisease}
		activeYear={data.activeYear}
	/>

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

	<main class="flex min-h-0 flex-1 flex-col md:flex-row">
		<section
			aria-label="Detection map"
			class="relative min-h-0 flex-1 {mobileView === 'map' ? 'flex' : 'hidden'} md:flex"
		>
			<!-- Track F replaces this with the MapLibre canvas. -->
			<div class="flex flex-1 items-center justify-center bg-muted/40 text-muted-foreground">
				<p class="text-sm">Map — {activeDiseaseName}, {data.activeYear}</p>
			</div>
			<div class="absolute bottom-4 left-4 w-56">
				<Legend {mode} year={data.activeYear} />
			</div>
		</section>

		<aside
			aria-label="Detection feed"
			class="min-h-0 flex-col overflow-y-auto border-t md:flex md:w-96 md:border-t-0 md:border-l {mobileView ===
			'list'
				? 'flex'
				: 'hidden'}"
		>
			<!-- Track G replaces this with the live detection feed. -->
			<div class="p-4 text-sm text-muted-foreground">
				<p>Detection feed for {activeDiseaseName}, {data.activeYear}.</p>
				{#if data.selectedCounty}
					<p class="mt-2">Filtered to county {data.selectedCounty}.</p>
				{/if}
			</div>
		</aside>
	</main>
</div>
