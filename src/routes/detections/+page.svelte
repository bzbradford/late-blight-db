<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SearchIcon from '@lucide/svelte/icons/search';
	import IncidentDialog from '$lib/components/admin/IncidentDialog.svelte';
	import DetectionDetail from '$lib/components/DetectionDetail.svelte';
	import DetectionsTable from '$lib/components/detections/DetectionsTable.svelte';
	import AppHeader from '$lib/components/shell/AppHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { DetectionRow } from '$lib/server/queries/detections';
	import { IncidentEditor } from '$lib/state/incident-editor.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const editor = new IncidentEditor();

	let pagination = $state({ pageIndex: 0, pageSize: 25 });

	/** Filters the loaded rows as you type; unlike the filters above, it never reloads. */
	let search = $state('');

	/** The detection open in the detail dialog. */
	let detail = $state<DetectionRow | null>(null);

	/** A year typed into the URL by hand still shows as selected, even with no data. */
	let yearOptions = $derived(
		data.filters.year && !data.years.includes(data.filters.year)
			? [data.filters.year, ...data.years].sort((a, b) => b - a)
			: data.years
	);

	let filtered = $derived(
		data.filters.diseaseSlug !== undefined ||
			data.filters.year !== undefined ||
			data.filters.reportedBy !== undefined ||
			Boolean(data.filters.includeRetracted)
	);

	/** You first, then everyone else who has entered something. */
	let reporterOptions = $derived(
		data.viewerId
			? [{ id: data.viewerId, name: 'Me' }, ...data.reporters.filter((r) => r.id !== data.viewerId)]
			: []
	);

	/** The CSV holds exactly the public rows for this disease and year. */
	let downloadHref = $derived(
		`${resolve('/detections.csv')}?${new URLSearchParams({
			disease: data.filters.diseaseSlug ?? 'all',
			year: data.filters.year ? String(data.filters.year) : 'all'
		})}`
	);

	/**
	 * Filters apply as soon as they change. Empty values are left out so the default view is
	 * a plain `/detections`, and the history entry is replaced so Back leaves the list rather
	 * than stepping through every filter change.
	 */
	function applyFilters(form: HTMLFormElement) {
		// A throwaway builder, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams();
		for (const [key, value] of new FormData(form)) {
			if (typeof value === 'string' && value !== '') params.set(key, value);
		}
		pagination = { ...pagination, pageIndex: 0 };
		const query = params.size ? `?${params}` : '';
		// The path is resolved; only the query string is appended.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/detections')}${query}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	/** Plain clicks open the modal; modified clicks (new tab, etc.) still reach the page. */
	function openInModal(event: MouseEvent, href: string) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		event.preventDefault();
		editor.open(href);
	}

	async function editFromDetail(detection: { id: number }) {
		await editor.open(resolve('/admin/incidents/[id]', { id: String(detection.id) }));
		if (editor.current) detail = null;
	}
</script>

<svelte:head>
	<title>Detections · Vegetable Disease Detections</title>
	<meta
		name="description"
		content="Every confirmed late blight and cucurbit downy mildew detection on the map, as a sortable table."
	/>
</svelte:head>

<AppHeader />

<main class="mx-auto max-w-7xl px-4 py-8">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="mr-auto text-xl font-semibold tracking-tight">Detections</h1>
		<Button variant="outline" href={downloadHref} download>
			<DownloadIcon />
			Download CSV
		</Button>
		{#if data.signedIn}
			<Button
				href={resolve('/admin/incidents/new')}
				onclick={(e: MouseEvent) => openInModal(e, resolve('/admin/incidents/new'))}
				disabled={editor.loading}
			>
				Add detection
			</Button>
		{/if}
	</div>

	<form
		method="GET"
		class="mt-6 flex flex-wrap items-end gap-3"
		onchange={(e) => applyFilters(e.currentTarget)}
	>
		<div class="space-y-1">
			<label for="filter-disease" class="text-xs text-muted-foreground">Disease</label>
			<select
				id="filter-disease"
				name="disease"
				class="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
			>
				<option value="" selected={data.filters.diseaseSlug === undefined}>All diseases</option>
				{#each data.diseases as disease (disease.id)}
					<option value={disease.slug} selected={data.filters.diseaseSlug === disease.slug}>
						{disease.name}
					</option>
				{/each}
			</select>
		</div>

		<div class="space-y-1">
			<label for="filter-year" class="text-xs text-muted-foreground">Year</label>
			<select
				id="filter-year"
				name="year"
				class="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
			>
				<option value="" selected={data.filters.year === undefined}>All years</option>
				{#each yearOptions as year (year)}
					<option value={year} selected={data.filters.year === year}>{year}</option>
				{/each}
			</select>
		</div>

		<!-- Signed-in only: the option values are user IDs, which never reach the public. -->
		{#if data.signedIn}
			<div class="space-y-1">
				<label for="filter-reported-by" class="text-xs text-muted-foreground">Reported by</label>
				<select
					id="filter-reported-by"
					name="reportedBy"
					class="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
				>
					<option value="" selected={data.filters.reportedBy === undefined}>Anyone</option>
					{#each reporterOptions as reporter (reporter.id)}
						<option value={reporter.id} selected={data.filters.reportedBy === reporter.id}>
							{reporter.name}
						</option>
					{/each}
				</select>
			</div>

			<label class="flex items-center gap-2 py-1.5 text-sm">
				<input type="checkbox" name="retracted" value="1" checked={data.filters.includeRetracted} />
				Show retracted
			</label>
		{/if}

		<!-- Filters apply on change; this is only for browsers without JavaScript. -->
		<noscript><Button type="submit" variant="secondary">Apply</Button></noscript>

		{#if filtered}
			<a
				href={resolve('/detections')}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
				onclick={() => (pagination = { ...pagination, pageIndex: 0 })}
				class="py-1.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
			>
				Reset filters
			</a>
		{/if}
	</form>

	<!-- Outside the filter form: typing here must not reload the page. -->
	<div class="relative mt-6 max-w-sm">
		<SearchIcon
			class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
			aria-hidden="true"
		/>
		<input
			type="search"
			bind:value={search}
			oninput={() => (pagination = { ...pagination, pageIndex: 0 })}
			aria-label="Search detections"
			placeholder="Search county, crop, strain, reporter…"
			class="w-full rounded-md border border-input bg-background py-1.5 pr-2 pl-8 text-sm"
		/>
	</div>

	<div class="mt-4">
		<DetectionsTable
			detections={data.detections}
			bind:pagination
			{search}
			onDetails={(d) => (detail = d)}
			onEdit={openInModal}
		/>
	</div>
</main>

<DetectionDetail
	detection={detail}
	diseaseName={detail?.diseaseName ?? ''}
	editing={editor.loading}
	onClose={() => (detail = null)}
	onEdit={editFromDetail}
/>

{#if data.signedIn}
	<IncidentDialog {editor} onChanged={() => invalidateAll()} />
{/if}
